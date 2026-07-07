import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { PersistenceAdapter, EditorSnapshot } from 'wayflow';

/**
 * Creates a Firestore-backed persistence adapter for Wayflow workflows.
 * Stores workflow graphs in the `workflows` collection under the user's UID.
 */
export function createFirestorePersistence(userId: string, workflowId: string): PersistenceAdapter {
  const workflowRef = doc(db, 'workflows', userId, 'userWorkflows', workflowId);

  return {
    load: async (): Promise<EditorSnapshot | null> => {
      try {
        const snap = await getDoc(workflowRef);
        if (!snap.exists()) return null;
        const data = snap.data();
        return {
          version: data.version || 1,
          graph: data.graph,
          viewport: data.viewport,
        };
      } catch (e) {
        console.error('Failed to load workflow from Firestore:', e);
        return null;
      }
    },
    save: async (snapshot: EditorSnapshot): Promise<void> => {
      try {
        await setDoc(workflowRef, {
          version: snapshot.version,
          graph: snapshot.graph,
          viewport: snapshot.viewport,
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.error('Failed to save workflow to Firestore:', e);
      }
    },
  };
}

/**
 * Creates a localStorage persistence adapter for development/preview.
 */
export { createLocalStoragePersistence } from 'wayflow';
