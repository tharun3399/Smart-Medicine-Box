import express from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import twilio from 'twilio';

// Load environment variables
dotenv.config();

// Paths relative to project root
const rootDir = process.cwd();
const dbPath = path.join(rootDir, 'backend', 'auth.db');
const schemaPath = path.join(rootDir, 'backend', 'schema.sql');

const JWT_SECRET = process.env.JWT_SECRET || 'Smartmedicine101';

if (!process.env.JWT_SECRET) {
  console.warn('[auth] JWT_SECRET not set in environment, using weak dev default.');
}

// Initialize SQLite database and apply schema
const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
// Use a small timeout so short locks are retried
const db = new Database(dbPath, { timeout: 5000 });
db.exec(schemaSql);

// Ensure users table has device_token and device_paired columns (for older DBs)
try {
  const cols = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  const hasDeviceToken = cols.some((c) => c.name === 'device_token');
  const hasDevicePaired = cols.some((c) => c.name === 'device_paired');
  if (!hasDeviceToken) {
    db.prepare('ALTER TABLE users ADD COLUMN device_token TEXT').run();
  }
  if (!hasDevicePaired) {
    db.prepare('ALTER TABLE users ADD COLUMN device_paired INTEGER NOT NULL DEFAULT 0').run();
  }
} catch (e) {
  console.warn('[db] Could not ensure device_token / device_paired columns on users table', e);
}

const app = express();
app.use(cors());
app.use(express.json());

// Twilio setup for phone call reminders
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;
const USER_PHONE_NUMBER = process.env.USER_PHONE_NUMBER;

const twilioClient =
  TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
    ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    : null;

if (!twilioClient) {
  console.warn('[twilio] Not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to enable phone reminders.');
}

// ESP8266 base URL for device pairing/control (IP on your Wi‑Fi network, e.g. http://10.36.109.123)
const ESP_BASE_URL = (process.env.ESP_BASE_URL || '').replace(/\/$/, '') || 'http://10.36.109.123';

// Simple health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Helper to generate JWT for a user
function generateToken(user: { id: number; email: string; name?: string | null }) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name ?? undefined },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

type AuthedUser = { id: number; email: string; name?: string | null };

// Middleware: require a valid JWT and attach decoded user info to req.user
function requireAuth(
  req: express.Request & { user?: AuthedUser },
  res: express.Response,
  next: express.NextFunction,
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const token = authHeader.slice('Bearer '.length);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & {
      sub: number;
      email: string;
      name?: string;
    };

    if (!decoded.sub || !decoded.email) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    req.user = {
      id: Number(decoded.sub),
      email: decoded.email,
      name: decoded.name ?? null,
    };

    return next();
  } catch (err) {
    console.error('[auth] Failed to verify JWT', err);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Create user (sign up) — expects { email, password, name, deviceToken }
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name, deviceToken } = req.body as {
    email?: string;
    password?: string;
    name?: string;
    deviceToken?: string;
  };

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }

  try {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const hash = await bcrypt.hash(password, 10);

    const stmt = db.prepare(
      'INSERT INTO users (email, password_hash, name, device_token, device_paired) VALUES (?, ?, ?, ?, ?)'
    );
    const info = stmt.run(email, hash, name || null, deviceToken || null, 0);

    const user = { id: Number(info.lastInsertRowid), email, name: name || null };
    const token = generateToken(user);

    res.status(201).json({
      token,
      user,
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Pair device: backend sends pairing request to ESP8266 when called directly
// from tools like Postman. Frontend now talks to the ESP itself and uses
// /api/device/mark-paired below just to update the DB.
// Expects { deviceToken }
app.post('/api/device/pair', requireAuth, async (req, res) => {
  const { deviceToken } = req.body as { deviceToken?: string };

  if (!deviceToken) {
    return res.status(400).json({ error: 'deviceToken is required' });
  }

  try {
    const url = `${ESP_BASE_URL}/pair?token=${encodeURIComponent(deviceToken)}`;
    console.log('[pair] Sending pairing request to ESP8266 at', url);
    const espRes = await fetch(url, { method: 'POST' });
    const text = await espRes.text().catch(() => '');

    if (!espRes.ok) {
      console.error('[pair] ESP8266 pairing failed', espRes.status, text);
      return res.status(502).json({ error: 'ESP8266 pairing request failed', status: espRes.status });
    }

    let ok = false;
    try {
      const data = text ? JSON.parse(text) : null;
      ok = !!(data as any)?.paired;
    } catch {
      ok = false;
    }

    if (!ok) {
      return res.status(409).json({ error: 'Device did not confirm pairing' });
    }

    return res.json({ paired: true });
  } catch (err) {
    console.error('[pair] Failed to contact ESP8266 for pairing', err);
    return res.status(502).json({ error: 'Failed to reach ESP8266 for pairing' });
  }
});

// Mark a user as paired without talking to the ESP (frontend uses this after
// it has already confirmed pairing directly with the device).
// Expects { deviceToken } – the email is taken from the authenticated user.
app.post('/api/device/mark-paired', requireAuth, (req, res) => {
  const { deviceToken } = req.body as { deviceToken?: string };
  const authed = (req as express.Request & { user?: AuthedUser }).user;

  if (!authed) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!deviceToken) {
    return res.status(400).json({ error: 'deviceToken is required' });
  }

  try {
    const update = db.prepare(
      'UPDATE users SET device_token = ?, device_paired = 1, updated_at = CURRENT_TIMESTAMP WHERE email = ?'
    );
    const info = update.run(deviceToken, authed.email);
    if (info.changes === 0) {
      // Restore original behavior: if no user row was updated, report 404 so
      // the client can decide how to handle missing local users.
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error('[mark-paired] Failed to update device_paired for user', authed.email, e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get device pairing status for the authenticated user.
app.get('/api/device/status', requireAuth, (req, res) => {
  const authed = (req as express.Request & { user?: AuthedUser }).user;
  if (!authed) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const stmt = db.prepare(
      'SELECT device_token, COALESCE(device_paired, 0) AS device_paired FROM users WHERE email = ?'
    );
    const row = stmt.get(authed.email) as { device_token?: string | null; device_paired: number } | undefined;

    if (!row) {
      // User not present in local DB: treat as "not paired" instead of 404
      // to avoid noisy console errors in the frontend.
      return res.json({ devicePaired: false, deviceToken: null });
    }

    return res.json({
      devicePaired: !!row.device_paired,
      deviceToken: row.device_token || null,
    });
  } catch (e) {
    console.error('[device-status] Failed to load device status', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Login — expects { email, password }, returns JWT
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const stmt = db.prepare(
      'SELECT id, email, password_hash, name, created_at, updated_at FROM users WHERE email = ?'
    );
    const user = stmt.get(email) as
      | { id: number; email: string; password_hash: string; name?: string | null }
      | undefined;

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Example protected route using JWT from Authorization: Bearer <token>
app.get('/api/auth/me', requireAuth, (req, res) => {
  const authed = (req as express.Request & { user?: AuthedUser }).user;
  if (!authed) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const stmt = db.prepare(
      'SELECT id, email, name, created_at, updated_at FROM users WHERE id = ?'
    );
    const user = stmt.get(authed.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a medicine record — expects
// { userEmail, name, dosage, totalDoses, frequency, days, times }
app.post('/api/medicines', requireAuth, (req, res) => {
  const { name, dosage, totalDoses, frequency, days, times } = req.body as {
    name?: string;
    dosage?: string;
    totalDoses?: number;
    frequency?: string;
    days?: string[];
    times?: string[];
  };

  const authed = (req as express.Request & { user?: AuthedUser }).user;
  if (!authed) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    const stmt = db.prepare(
      'INSERT INTO medicines (user_email, name, dosage, total_doses, frequency, days, times) VALUES (?, ?, ?, ?, ?, ?, ?)' 
    );
    const info = stmt.run(
      authed.email,
      name,
      dosage || null,
      typeof totalDoses === 'number' ? totalDoses : null,
      frequency || null,
      days && days.length ? days.join(',') : null,
      times && times.length ? times.join(',') : null
    );

    res.status(201).json({ id: Number(info.lastInsertRowid) });
  } catch (err) {
    if ((err as any)?.code === 'SQLITE_BUSY') {
      console.warn('[medicines] SQLite database is locked, skipping local insert but keeping Firestore record.');
      // Treat as success from the client perspective; Firestore already has the medicine.
      return res.status(201).json({ id: null, skipped: true });
    }

    console.error('[medicines] Failed to insert medicine', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// KnowMed: proxy questions to local Ollama instance
// Expects: { question }
app.post('/api/knowmed', requireAuth, async (req, res) => {
  const { question } = req.body as { question?: string };

  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'question is required' });
  }

  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const ollamaModel = process.env.OLLAMA_MODEL || 'llama3';

  try {
    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: ollamaModel,
        messages: [
          {
            role: 'system',
            content:
              'You are KnowMed, a helpful assistant answering questions about medicines. Explain clearly and simply. Do not give medical advice beyond general information; always recommend consulting a doctor for personal decisions.',
          },
          {
            role: 'user',
            content: question,
          },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      console.error('[knowmed] Ollama responded with status', response.status, await response.text());
      return res.status(502).json({ error: 'Failed to get response from Ollama' });
    }

    const data = (await response.json()) as any;
    const answer: string = data?.message?.content ?? '';

    res.json({ answer });
  } catch (err) {
    console.error('[knowmed] Error contacting Ollama', err);
    res.status(500).json({ error: 'Failed to contact Ollama. Is it running on this machine?' });
  }
});

// KnowMed (streaming): stream tokens from Ollama to the client as they are generated
app.post('/api/knowmed-stream', requireAuth, async (req, res) => {
  const { question } = req.body as { question?: string };

  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'question is required' });
  }

  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const ollamaModel = process.env.OLLAMA_MODEL || 'llama3';

  try {
    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: ollamaModel,
        messages: [
          {
            role: 'system',
            content:
              'You are KnowMed, a helpful assistant answering questions about medicines. Explain clearly and simply. Do not give medical advice beyond general information; always recommend consulting a doctor for personal decisions.',
          },
          {
            role: 'user',
            content: question,
          },
        ],
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      console.error('[knowmed-stream] Ollama responded with status', response.status, await response.text());
      return res.status(502).json({ error: 'Failed to get response from Ollama (stream)' });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');

    const decoder = new TextDecoder();
    const reader = (response.body as any).getReader();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter((l) => l.trim().length > 0);
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          const piece: string = (data?.message?.content as string) ?? (data?.response as string) ?? '';
          if (piece) {
            res.write(piece);
          }
        } catch {
          // Not a full JSON object; ignore.
        }
      }
    }

    res.end();
  } catch (err) {
    console.error('[knowmed-stream] Error contacting Ollama', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to contact Ollama (stream). Is it running on this machine?' });
    } else {
      res.end();
    }
  }
});

// Simple endpoint to trigger a one-off test call
app.post('/api/call-test', requireAuth, async (req, res) => {
  if (!twilioClient || !TWILIO_FROM_NUMBER || !USER_PHONE_NUMBER) {
    return res.status(400).json({ error: 'Twilio is not configured on the server.' });
  }

  const message = (req.body as { message?: string }).message ||
    'This is a test call from your Smart Medicine Box application.';

  try {
    await twilioClient.calls.create({
      to: USER_PHONE_NUMBER,
      from: TWILIO_FROM_NUMBER,
      twiml: `<Response><Say>${message}</Say></Response>`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[twilio] Test call failed', err);
    res.status(500).json({ error: 'Failed to place test call' });
  }
});

// Scheduler: place up to 5 reminder calls around each medicine time
// For a dose at HH:MM, calls are attempted at: HH:MM-10, -5, 0, +5, +10 minutes
type MedicineRow = { id: number; name: string; times: string | null };

const reminderCallState = new Set<string>();
const takenDoseState = new Set<string>(); // marks (date|medicineName|time) as already taken

// Mark a dose as taken so future reminder calls stop for that dose today.
// Also persist an intake record in the DB for verification/audit.
app.post('/api/reminders/dose-taken', requireAuth, (req, res) => {
  const { medicineName, time } = req.body as {
    medicineName?: string;
    time?: string;
  };

  const authed = (req as express.Request & { user?: AuthedUser }).user;
  if (!authed) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!medicineName || !time) {
    return res.status(400).json({ error: 'medicineName and time are required' });
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const key = `${todayKey}|${medicineName}|${time}`;
  takenDoseState.add(key);

  // Best-effort: record this intake in the intakes table
  try {
    const stmt = db.prepare(
      'INSERT INTO intakes (user_email, medicine_name, time_label) VALUES (?, ?, ?)'
    );
    stmt.run(authed.email, medicineName, time);
  } catch (e) {
    console.warn('[intakes] Failed to insert intake record', e);
  }

  res.json({ ok: true });
});

// Return the last 20 intake readings for the dashboard plot
// Always scoped to the authenticated user
app.get('/api/intakes/recent', requireAuth, (req, res) => {
  const authed = (req as express.Request & { user?: AuthedUser }).user;
  if (!authed) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const rows: Array<{
      id: number;
      user_email: string | null;
      medicine_name: string;
      time_label: string;
      taken_at: string;
    }> = db
      .prepare(
        'SELECT id, user_email, medicine_name, time_label, taken_at FROM intakes WHERE user_email = ? ORDER BY datetime(taken_at) DESC LIMIT 20',
      )
      .all(authed.email) as any;

    res.json({ readings: rows });
  } catch (e) {
    console.error('[intakes] Failed to load recent intakes', e);
    res.status(500).json({ error: 'Failed to load recent intakes' });
  }
});

// Return all intake readings for a specific calendar day for the authenticated user.
// Query params:
//   - date: YYYY-MM-DD (defaults to today if omitted)
app.get('/api/intakes/by-date', requireAuth, (req, res) => {
  const authed = (req as express.Request & { user?: AuthedUser }).user;
  if (!authed) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // If the client does not provide a date, default to today in the server's local time.
  const dateParam = (req.query.date as string | undefined)?.trim();

  const todayIso = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayIso;

  // We query the intakes whose taken_at falls within [date 00:00:00, date 23:59:59]
  const start = `${date} 00:00:00`;
  const end = `${date} 23:59:59`;

  try {
    const rows: Array<{
      id: number;
      user_email: string | null;
      medicine_name: string;
      time_label: string;
      taken_at: string;
    }> = db
      .prepare(
        'SELECT id, user_email, medicine_name, time_label, taken_at FROM intakes WHERE user_email = ? AND datetime(taken_at) BETWEEN datetime(?) AND datetime(?) ORDER BY datetime(taken_at) ASC',
      )
      .all(authed.email, start, end) as any;

    res.json({
      date,
      readings: rows,
    });
  } catch (e) {
    console.error('[intakes] Failed to load intakes by date', e);
    res.status(500).json({ error: 'Failed to load intake history for the selected date' });
  }
});

function startReminderScheduler() {
  if (!twilioClient || !TWILIO_FROM_NUMBER || !USER_PHONE_NUMBER) {
    console.warn('[reminders] Twilio not fully configured, skipping call scheduler.');
    return;
  }

  console.log('[reminders] Starting reminder scheduler (checks every minute).');

  setInterval(async () => {
    try {
      const now = new Date();
      const todayKey = now.toISOString().slice(0, 10); // YYYY-MM-DD
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      const rows = db
        .prepare('SELECT id, name, times FROM medicines')
        .all() as MedicineRow[];

      // minutes relative to the dose time: -10, -5, 0, +5, +10
      const OFFSETS = [-10, -5, 0, 5, 10];

      for (const row of rows) {
        if (!row.times) continue;
        const times = row.times.split(',').map((t) => t.trim()).filter(Boolean);
        for (const t of times) {
          const [hStr, mStr] = t.split(':');
          const hh = Number(hStr);
          const mm = Number(mStr);
          if (Number.isNaN(hh) || Number.isNaN(mm)) continue;
          const doseMinutes = hh * 60 + mm;

          for (const offset of OFFSETS) {
            const triggerMinute = doseMinutes + offset; // e.g. 10 min before
            if (triggerMinute === currentMinutes) {
              const takenKey = `${todayKey}|${row.name}|${t}`;
              if (takenDoseState.has(takenKey)) {
                continue; // medicine already taken for this time today
              }

              const key = `${todayKey}|${row.id}|${t}|${offset}`;
              if (reminderCallState.has(key)) continue; // already called for this slot

              reminderCallState.add(key);

              const spokenTime = t;
              const message = `This is your smart medicine box. It is almost time to take your medicine ${row.name} at ${spokenTime}.`;

              try {
                await twilioClient!.calls.create({
                  to: USER_PHONE_NUMBER!,
                  from: TWILIO_FROM_NUMBER!,
                  twiml: `<Response><Say>${message}</Say></Response>`,
                });
                console.log('[reminders] Placed reminder call for medicine', row.name, 'time', t, 'offset', offset);
              } catch (err) {
                console.error('[reminders] Failed to place reminder call', err);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('[reminders] Scheduler error', err);
    }
  }, 60_000);
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Auth server running on http://localhost:${PORT}`);
  startReminderScheduler();
});
