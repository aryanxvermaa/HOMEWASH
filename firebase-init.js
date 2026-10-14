/* =========================================================
   HomeWash – Firebase initialization
   -----------------------------------------------------
   1. Go to https://console.firebase.google.com
   2. Create a project (or open an existing one)
   3. Build > Firestore Database > Create database (start in test mode)
   4. Project settings > your apps > Add app > Web (</>)
   5. Copy the firebaseConfig object Firebase gives you and paste
      it below, replacing the placeholder values.
   ========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// True once you've replaced the placeholder values above.
export const firebaseConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY";

let app = null;
let db = null;

if (firebaseConfigured) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
} else {
    console.warn(
        "HomeWash: firebase-init.js still has placeholder config. " +
        "Orders will only be saved in this browser (localStorage) until you add your real Firebase config."
    );
}

export { db };