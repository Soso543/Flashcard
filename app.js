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
    const folderName = folderInput.value.trim() || 'General';
    const q = questionInput.value.trim();
    const img = imageInput.value.trim();
    const a = answerInput.value.trim();

    // Enforce length limits just in case HTML bypasses it
    if (q.length > 200 || a.length > 200) {
        return alert("Questions and answers must be under 200 characters.");
    }

    if (!q || !a) return;

    if (editModeId) {
        const cardIndex = flashcards.findIndex(card => card.id === editModeId);
        if (cardIndex > -1) {
            flashcards[cardIndex] = { id: editModeId, folder: folderName, question: q, image: img, answer: a };
        }
        submitBtn.textContent = 'Add Card';
        editModeId = null;
    } else {
        flashcards.push({ id: Date.now(), folder: folderName, question: q, image: img, answer: a });
    }

    saveToStorage();
    renderCardList();
    cardForm.reset();
    folderInput.value = folderName; // Keep same folder active for rapid entry
    questionInput.focus();
});

function updateFolderDropdowns() {
    const folders = [...new Set(flashcards.map(c => c.folder || 'General'))];
    
    // Update Autocomplete
    folderList.innerHTML = folders.map(f => `<option value="${f}">`).join('');
    
    // Update Filter
    const currentFilter = folderFilter.value;
    folderFilter.innerHTML = `<option value="all">All Folders</option>` + 
        folders.map(f => `<option value="${f}">${f}</option>`).join('');
    
    if (folders.includes(currentFilter) || currentFilter === 'all') {
        folderFilter.value = currentFilter;
    }
}

folderFilter.addEventListener('change', renderCardList);

function renderCardList() {
    updateFolderDropdowns();
    cardGrid.innerHTML = '';
    
    const filterVal = folderFilter.value;
    const cardsToRender = filterVal === 'all' ? flashcards : flashcards.filter(c => (c.folder || 'General') === filterVal);

    cardsToRender.forEach(card => {
        const cardEl = document.createElement('div');
        cardEl.className = 'mini-card';
        cardEl.innerHTML = `
            <div>
                <span class="folder-badge">${card.folder || 'General'}</span>
                <strong>Q: ${card.question}</strong>
                ${card.image ? `<img src="${card.image}" alt="thumb" style="max-width:100%; height:80px; object-fit:cover; border-radius:4px; margin-top:0.5rem;">` : ''}
                <p>A: ${card.answer}</p>
            </div>
            <div class="card-actions">
                <button class="edit-btn" onclick="editCard(${card.id})">Edit</button>
                <button class="delete-btn" onclick="deleteCard(${card.id})">Delete</button>
            </div>
        `;
        cardGrid.appendChild(cardEl);
    });
}

// Attach these to the window object so the inline HTML onclick works inside a Module
window.editCard = (id) => {
    const card = flashcards.find(c => c.id === id);
    if (card) {
        folderInput.value = card.folder || 'General';
        questionInput.value = card.question;
        imageInput.value = card.image || '';
        answerInput.value = card.answer;
        editModeId = id;
        submitBtn.textContent = 'Update Card';
        window.scrollTo(0, 0);
    }
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
    const cardsToRevise = filterVal === 'all' ? flashcards : flashcards.filter(c => (c.folder || 'General') === filterVal);

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
    
    if (card.image) {
        reviseImage.src = card.image;
        reviseImage.classList.remove('hidden');
    } else {
        reviseImage.classList.add('hidden');
        reviseImage.src = '';
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
        : flashcards.filter(c => (c.folder || 'General') === filterVal);

    if (cardsToShare.length === 0) return alert("No cards to share!");
    
    if (cardsToShare.length > 100) {
        return alert(`You are trying to share ${cardsToShare.length} cards. The limit is 100. Please select a specific folder from the dropdown.`);
    }

    shareCardsBtn.textContent = "Uploading...";
    shareCardsBtn.disabled = true;

    try {
        const docRef = await addDoc(collection(db, "shared_decks"), {
            cards: cardsToShare,
            timestamp: new Date()
        });

        const baseUrl = window.location.href.split('?')[0];
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


// ==========================================
// 8. START THE APP
// ==========================================
init();