// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, getDocs, doc, setDoc, addDoc, deleteDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAyMsDnA4TadOXrwxUqumwPAji9S3QiEAE",
  authDomain: "superprod-2ced1.firebaseapp.com",
  projectId: "superprod-2ced1",
  storageBucket: "superprod-2ced1.appspot.com",
  messagingSenderId: "691324529613",
  appId: "1:691324529613:web:a050a6d44f06481503b284",
  measurementId: "G-53FH6JGS20"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

console.log("Firebase initialized");

export { db, storage, collection, getDocs, doc, setDoc, addDoc, deleteDoc, getDoc, updateDoc, ref, uploadString, getDownloadURL };
