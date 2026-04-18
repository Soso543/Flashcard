// ==========================================
// 1. FIREBASE SETUP & IMPORTS
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ⚠️ IMPORTANT: Replace these values with your actual Firebase config!
const firebaseConfig = {
  apiKey: "AIzaSyBi2xe-7emG0HK0fIpSQWN0oyVLcFuTwco",
  authDomain: "flashcard-kub2.firebaseapp.com",
  projectId: "flashcard-kub2",
  storageBucket: "flashcard-kub2.firebasestorage.app",
  messagingSenderId: "822550846103",
  appId: "1:822550846103:web:96ddd28bc5a0f2f6f9e7d2"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);


// ==========================================
// 2. STATE VARIABLES & DOM ELEMENTS
// ==========================================
let flashcards = [];
let editModeId = null;
let revisionQueue = [];
let currentReviseIndex = 0;
let isFlipped = false;

// Dashboard Elements
const dashboard = document.getElementById('dashboard');
const cardForm = document.getElementById('card-form');
const folderInput = document.getElementById('folder-input');
const folderList = document.getElementById('folder-list');
const folderFilter = document.getElementById('folder-filter');
const questionInput = document.getElementById('question-input');
const imageInput = document.getElementById('image-input');
const answerInput = document.getElementById('answer-input');
const submitBtn = document.getElementById('submit-btn');
const cardGrid = document.getElementById('card-grid');

// Action Buttons
const shareCardsBtn = document.getElementById('share-cards-btn');
const startReviseBtn = document.getElementById('start-revise-btn');
const exportBtn = document.getElementById('export-btn');
const importProxyBtn = document.getElementById('import-proxy-btn');
const importInput = document.getElementById('import-input');

// Revision Elements
const reviseView = document.getElementById('revise-view');
const exitBtn = document.getElementById('exit-btn');
const activeFlashcard = document.getElementById('active-flashcard');
const reviseImage = document.getElementById('revise-image');
const reviseQuestion = document.getElementById('revise-question');
const reviseAnswer = document.getElementById('revise-answer');
const progressIndicator = document.getElementById('progress-indicator');



// ==========================================
// 3. INITIALIZATION & LOCAL STORAGE
// ==========================================
async function init() {
    // 1. Load local cards first
    const stored = localStorage.getItem('myFlashcards');
    if (stored) {
        flashcards = JSON.parse(stored);
    }

    // 2. Check if opening a shared Firebase link
    const urlParams = new URLSearchParams(window.location.search);
    const deckId = urlParams.get('deck');

    if (deckId) {
        try {
            const docRef = doc(db, "shared_decks", deckId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const sharedData = docSnap.data().cards;
                if(confirm(`Import ${sharedData.length} shared flashcards?`)) {
                    flashcards = [...flashcards, ...sharedData]; 
                    saveToStorage();
                }
            } else {
                alert("This shared deck does not exist or has expired.");
            }
        } catch (e) {
            console.error("Error fetching deck:", e);
            alert("Could not load the shared deck. Please check your internet connection.");
        }
        // Clean URL after importing so it doesn't prompt again on refresh
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    renderCardList();
    updateReviseButtonStatus();
}

function saveToStorage() {
    localStorage.setItem('myFlashcards', JSON.stringify(flashcards));
    updateReviseButtonStatus();
}


// ==========================================
// 4. ADDING, EDITING, & RENDERING CARDS
// ==========================================
cardForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = questionInput.value.trim();
    const img = imageInput.value.trim();
    const a = answerInput.value.trim();

    if (q.length > 200 || a.length > 200) return alert("Text too long!");
    if (!q || !a) return;

    if (editModeId) {
        const cardIndex = flashcards.findIndex(card => card.id === editModeId);
        if (cardIndex > -1) {
            // Keep the existing folder during an edit
            const existingFolder = flashcards[cardIndex].folder;
            flashcards[cardIndex] = { ...flashcards[cardIndex], question: q, image: img, answer: a };
        }
        submitBtn.textContent = 'Add Card';
        editModeId = null;
    } else {
        // NEW CARDS: Set folder to null and selected to false by default
        flashcards.push({ 
            id: Date.now(), 
            folder: null, 
            question: q, 
            image: img, 
            answer: a,
            selected: false 
        });
    }

    saveToStorage();
    renderCardList();
    cardForm.reset();
    questionInput.focus();
});

function updateFolderDropdowns() {
    // Get unique folders, excluding 'null'
    const folders = [...new Set(flashcards.map(c => c.folder).filter(f => f !== null))];
    
    const filterVal = folderFilter.value;
    
    // Fill the top filter dropdown
    folderFilter.innerHTML = `<option value="all">All Cards</option>` + 
        `<option value="Uncategorized">Uncategorized</option>` +
        folders.map(f => `<option value="${f}">${f}</option>`).join('');
    
    // Fill the "Move to Folder" dropdown in the Bulk Bar
    const moveSelect = document.getElementById('move-to-folder-select');
    moveSelect.innerHTML = `
        <option value="">Move to Folder...</option>
        <option value="new">+ Create New Folder</option>
        <option value="Uncategorized">Remove from Folder</option>
        ` + folders.map(f => `<option value="${f}">${f}</option>`).join('');

    folderFilter.value = filterVal;
}

const revisionView = document.getElementById('revision-view'); // We need to check if this is visible

folderFilter.addEventListener('change', (e) => {
    const selectedFolder = e.target.value;

    // CHECK: Are we currently in the Dashboard or the Revision view?
    if (revisionView.classList.contains('hidden')) {
        
        // --- WE ARE IN THE DASHBOARD ---
        // Just update the list of cards on the screen
        renderCardList(); 
        
        // If you have a function that disables the revise button for empty folders, call it here:
        // updateReviseButtonStatus(); 
        
    } else {
        
        // --- WE ARE IN THE REVISION SCREEN ---
        // 1. Gather the cards for the new folder
        let newDeck = selectedFolder === 'all' 
            ? flashcards 
            : flashcards.filter(c => (c.folder || "Uncategorized") === selectedFolder);

        // 2. Prevent switching to an empty folder
        if (newDeck.length === 0) {
            alert("This folder is empty! Please choose another one.");
            // Revert dropdown back to the folder you were just studying
            e.target.value = (currentRevisionDeck[0].folder || "Uncategorized");
            return;
        }

        // 3. Update the revision variables and show the new card
        currentRevisionDeck = newDeck;
        currentIndex = 0; 
        showNextRevisionCard();
    }
});

// Attach these to the window object so the inline HTML onclick works inside a Module
window.editCard = (id) => {
    // 1. Find the specific card in your database/array
    const card = flashcards.find(c => c.id === id);
    if (!card) return;

    // 2. Populate the form inputs with the card's current data
    // (Ensure these variable names match what you use at the top of your app.js)
    questionInput.value = card.question;
    answerInput.value = card.answer;
    if (typeof imageInput !== 'undefined') {
        imageInput.value = card.image || '';
    }

    // 3. Turn on Edit Mode
    editModeId = id;

    // 4. Update the submit button text so you know you are editing
    // (Ensure this matches your submit button's variable name)
    const submitBtn = document.querySelector('#card-form button[type="submit"]');
    if (submitBtn) {
        submitBtn.textContent = 'Save Changes';
    }

    // 5. Scroll to the top of the page so you can see the form
    window.scrollTo({ top: 0, behavior: 'smooth' });
    questionInput.focus();
};

window.deleteCard = (id) => {
    flashcards = flashcards.filter(card => card.id !== id);
    saveToStorage();
    renderCardList();
};

function updateReviseButtonStatus() {
    startReviseBtn.disabled = flashcards.length === 0;
}


// ==========================================
// 5. REVISION MODE LOGIC
// ==========================================
startReviseBtn.addEventListener('click', startRevision);
exitBtn.addEventListener('click', exitRevision);
activeFlashcard.addEventListener('click', handleCardInteraction);

document.addEventListener('keydown', (e) => {
    if (dashboard.classList.contains('hidden')) {
        if (e.code === 'Space' || e.code === 'ArrowRight') {
            e.preventDefault();
            handleCardInteraction();
        } else if (e.code === 'Escape') {
            exitRevision();
        }
    }
});

function startRevision() {
    const filterVal = folderFilter.value;
    const cardsToRevise = filterVal === 'all' ? flashcards : flashcards.filter(c => (c.folder || 'Uncategorized') === filterVal);

    if (cardsToRevise.length === 0) return alert('No cards in this folder!');
    
    revisionQueue = [...cardsToRevise].sort(() => Math.random() - 0.5);
    currentReviseIndex = 0;
    isFlipped = false;
    activeFlashcard.classList.remove('flipped');

    dashboard.classList.add('hidden');
    reviseView.classList.remove('hidden');
    
    loadCurrentRevisionCard();
}

function loadCurrentRevisionCard() {
    const card = revisionQueue[currentReviseIndex];
    reviseQuestion.textContent = card.question;
    reviseAnswer.textContent = card.answer;
    
    if (card.image && card.image.trim() !== "") {
        reviseImage.src = card.image;
        reviseImage.style.display = 'block';
        reviseQuestion.style.fontSize = "1.5rem";
    } else {
        reviseImage.src = "";
        reviseImage.style.display = 'none';
        reviseQuestion.style.fontSize = "1.8rem";
    }

    progressIndicator.textContent = `Card ${currentReviseIndex + 1} of ${revisionQueue.length}`;
}

function handleCardInteraction() {
    if (!isFlipped) {
        activeFlashcard.classList.add('flipped');
        isFlipped = true;
    } else {
        currentReviseIndex++;
        if (currentReviseIndex < revisionQueue.length) {
            activeFlashcard.classList.remove('flipped');
            isFlipped = false;
            setTimeout(() => { loadCurrentRevisionCard(); }, 300);
        } else {
            alert('🎉 Revision complete! Great job.');
            exitRevision();
        }
    }
}

function exitRevision() {
    reviseView.classList.add('hidden');
    dashboard.classList.remove('hidden');
    activeFlashcard.classList.remove('flipped');
    isFlipped = false;
}


// ==========================================
// 6. FIREBASE SHARING
// ==========================================
shareCardsBtn.addEventListener('click', async () => {
    const filterVal = folderFilter.value;
    const cardsToShare = filterVal === 'all' 
        ? flashcards 
        : flashcards.filter(c => (c.folder || 'Uncategorized') === filterVal);

    if (cardsToShare.length === 0) return alert("No cards to share!");
    
    if (cardsToShare.length > 100) {
        return alert(`You are trying to share ${cardsToShare.length} cards. The limit is 100. Please select a specific folder from the dropdown.`);
    }

    shareCardsBtn.textContent = "Uploading...";
    shareCardsBtn.disabled = true;

    try {
        // Upload to Firebase
        const docRef = await addDoc(collection(db, "shared_decks"), {
            cards: cardsToShare,
            timestamp: new Date()
        });

        // Create the new short link AND force it to be secure
        const baseUrl = window.location.href.split('?')[0].replace("http://", "https://");
        const shareUrl = `${baseUrl}?deck=${docRef.id}`;
        
        navigator.clipboard.writeText(shareUrl);
        alert("Success! Short link copied to clipboard.");
    } catch (e) {
        console.error("Error sharing:", e);
        alert("Failed to share cards. Check your internet or Firebase setup.");
    }

    shareCardsBtn.textContent = "Share Cards";
    shareCardsBtn.disabled = false;
});


// ==========================================
// 7. EXPORT & IMPORT (FLASH DRIVE)
// ==========================================
exportBtn.addEventListener('click', () => {
    if (flashcards.length === 0) return alert("No cards to export!");
    const dataStr = JSON.stringify(flashcards, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', 'my_flashcards.json');
    linkElement.click();
});

importProxyBtn.addEventListener('click', () => {
    importInput.click(); 
});

importInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const importedCards = JSON.parse(event.target.result);
            if (Array.isArray(importedCards)) {
                // Strip out anything over 200 characters on import
                const validCards = importedCards.filter(c => c.question.length <= 200 && c.answer.length <= 200);
                if (confirm(`Import ${validCards.length} valid cards?`)) {
                    flashcards = [...flashcards, ...validCards];
                    saveToStorage();
                    renderCardList();
                }
            }
        } catch (err) { 
            alert("Invalid flashcard file."); 
        }
    };
    reader.readAsText(file);
    importInput.value = ''; // Reset input so you can import the same file again if needed
});

// Function to check/uncheck a card
window.toggleSelect = (id) => {
    const card = flashcards.find(c => c.id === id);
    if (card) card.selected = !card.selected;
    renderCardList();
};

// Function to show/hide the bottom blue bar
function updateBulkBar() {
    const selectedCards = flashcards.filter(c => c.selected);
    const bar = document.getElementById('bulk-action-bar');
    const countEl = document.getElementById('selected-count');
    
    if (selectedCards.length > 0) {
        bar.classList.remove('hidden');
        countEl.textContent = `${selectedCards.length} cards selected`;
    } else {
        bar.classList.add('hidden');
    }
}

// Logic for the Folder Dropdown in the Bulk Bar
document.getElementById('move-to-folder-select').addEventListener('change', (e) => {
    const action = e.target.value;
    if (!action) return;

    let folderName = action;
    if (action === 'new') {
        folderName = prompt("Enter name for the new folder:");
        if (!folderName) {
            e.target.value = "";
            return;
        }
    }

    // Apply the folder to all selected cards
    flashcards.forEach(card => {
        if (card.selected) {
            card.folder = folderName;
            card.selected = false; // Deselect after moving
        }
    });

    saveToStorage();
    renderCardList();
    e.target.value = ""; // Reset the dropdown
});

// Logic for Bulk Delete
document.getElementById('bulk-delete-btn').addEventListener('click', () => {
    if (confirm("Delete all selected cards?")) {
        flashcards = flashcards.filter(c => !c.selected);
        saveToStorage();
        renderCardList();
    }
});

// Logic for Cancel Button
document.getElementById('cancel-selection-btn').addEventListener('click', () => {
    flashcards.forEach(c => c.selected = false);
    renderCardList();
});

// ==========================================
// 8. START THE APP
// ==========================================
init();