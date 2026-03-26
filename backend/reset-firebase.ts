import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../src/firebase';

async function deleteCollection(name: string) {
  console.log(`[reset-firebase] Deleting all documents from collection '${name}'...`);
  const colRef = collection(db, name);
  const snapshot = await getDocs(colRef);

  if (snapshot.empty) {
    console.log(`[reset-firebase] Collection '${name}' is already empty.`);
    return;
  }

  const batchSize = snapshot.size;
  let count = 0;

  for (const d of snapshot.docs) {
    try {
      await deleteDoc(doc(colRef, d.id));
      count++;
    } catch (err) {
      console.error(`[reset-firebase] Failed to delete document ${d.id} in '${name}':`, err);
    }
  }

  console.log(`[reset-firebase] Deleted ${count} document(s) from '${name}'.`);
}

(async () => {
  try {
    await deleteCollection('medications');
  } catch (err) {
    console.error('[reset-firebase] Error while resetting Firestore:', err);
    process.exitCode = 1;
  }
})();
