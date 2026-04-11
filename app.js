// --- State Management ---
let flashcards = JSON.parse(localStorage.getItem('flashcards')) || [];
let editModeId = null;

// Revision State
let revisionQueue = [];
let currentReviseIndex = 0;
let isFlipped = false;

// --- DOM Elements ---
const dashboard = document.getElementById('dashboard');
const reviseView = document.getElementById('revise-view');
const cardForm = document.getElementById('card-form');
const questionInput = document.getElementById('question-input');
const answerInput = document.getElementById('answer-input');
const submitBtn = document.getElementById('submit-btn');
const cardGrid = document.getElementById('card-grid');
const startReviseBtn = document.getElementById('start-revise-btn');
const exitBtn = document.getElementById('exit-btn');
const shareAppBtn = document.getElementById('share-app-btn');
const shareCardsBtn = document.getElementById('share-cards-btn');

// Revision Elements
const activeFlashcard = document.getElementById('active-flashcard');
const reviseQuestion = document.getElementById('revise-question');
const reviseAnswer = document.getElementById('revise-answer');
const progressIndicator = document.getElementById('progress-indicator');

// --- Initialization & Link Reading ---
function init() {
    // 1. Check if the URL has "?data=" inside it
    const urlParams = new URLSearchParams(window.location.search);
    const sharedData = urlParams.get('data');

    if (sharedData) {
        try {
            // Unpack the data from the URL
            const decodedData = JSON.parse(decodeURIComponent(atob(sharedData)));
            
            if (Array.isArray(decodedData) && decodedData.length > 0) {
                if(confirm("Import shared flashcards? This will replace your current cards.")) {
                    flashcards = decodedData;
                    saveToStorage();
                }
            }
            // Clean up the URL so it looks normal again
            window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) {
            console.error("Failed to parse shared data", e);
            alert("This shared link appears to be invalid or corrupted.");
        }
    }

    renderCardList();
    updateReviseButtonStatus();
}

// --- Local Storage Sync ---
function saveToStorage() {
    localStorage.setItem('flashcards', JSON.stringify(flashcards));
    updateReviseButtonStatus();
}

// --- Dashboard Logic ---
cardForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = questionInput.value.trim();
    const a = answerInput.value.trim();

    if (!q || !a) return;

    if (editModeId) {
        // Update existing card
        const cardIndex = flashcards.findIndex(card => card.id === editModeId);
        if (cardIndex > -1) {
            flashcards[cardIndex] = { id: editModeId, question: q, answer: a };
        }
        submitBtn.textContent = 'Add Card';
        editModeId = null;
    } else {
        // Add new card
        const newCard = { id: Date.now(), question: q, answer: a };
        flashcards.push(newCard);
    }

    saveToStorage();
    renderCardList();
    cardForm.reset();
});

function renderCardList() {
    cardGrid.innerHTML = '';
    flashcards.forEach(card => {
        const cardEl = document.createElement('div');
        cardEl.className = 'mini-card';
        cardEl.innerHTML = `
            <div>
                <strong>Q: ${card.question}</strong>
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

window.deleteCard = (id) => {
    flashcards = flashcards.filter(card => card.id !== id);
    saveToStorage();
    renderCardList();
};

window.editCard = (id) => {
    const card = flashcards.find(c => c.id === id);
    if (card) {
        questionInput.value = card.question;
        answerInput.value = card.answer;
        editModeId = id;
        submitBtn.textContent = 'Update Card';
        questionInput.focus();
    }
};

function updateReviseButtonStatus() {
    startReviseBtn.disabled = flashcards.length === 0;
}

// --- Revision Mode Logic ---
startReviseBtn.addEventListener('click', startRevision);
exitBtn.addEventListener('click', exitRevision);
activeFlashcard.addEventListener('click', handleCardInteraction);

// Keyboard shortcuts (Space/Arrows) during revision
document.addEventListener('keydown', (e) => {
    if (dashboard.classList.contains('hidden')) {
        if (e.code === 'Space' || e.code === 'ArrowRight') {
            e.preventDefault(); // Prevent page scroll
            handleCardInteraction();
        } else if (e.code === 'Escape') {
            exitRevision();
        }
    }
});

function startRevision() {
    if (flashcards.length === 0) return;
    
    // Create a shuffled copy of the flashcards array
    revisionQueue = [...flashcards].sort(() => Math.random() - 0.5);
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
    progressIndicator.textContent = `Card ${currentReviseIndex + 1} of ${revisionQueue.length}`;
}

function handleCardInteraction() {
    if (!isFlipped) {
        // 1st Click: Flip to show answer
        activeFlashcard.classList.add('flipped');
        isFlipped = true;
    } else {
        // 2nd Click: Move to next card
        currentReviseIndex++;
        
        if (currentReviseIndex < revisionQueue.length) {
            // Unflip and load next card smoothly
            activeFlashcard.classList.remove('flipped');
            isFlipped = false;
            
            // Wait for flip animation to finish before changing text
            setTimeout(() => {
                loadCurrentRevisionCard();
            }, 300); // Matches CSS transition time
        } else {
            // End of revision
            alert('🎉 Revision complete! Great job.');
            exitRevision();
        }
    }
}

function exitRevision() {
    reviseView.classList.add('hidden');
    dashboard.classList.remove('hidden');
    // reset state
    activeFlashcard.classList.remove('flipped');
    isFlipped = false;
}

// Run app
init();

// --- Sharing Logic ---

// Helper function to copy text to clipboard
function copyToClipboard(text, successMessage) {
    navigator.clipboard.writeText(text).then(() => {
        alert(successMessage);
    }).catch(err => {
        // Fallback for older browsers
        prompt("Copy this link manually:", text);
    });
}

// Scenario 1: Share App Only (No Data)
shareAppBtn.addEventListener('click', () => {
    // Grabs the current website URL but strips away any extra data attached to it
    const baseUrl = window.location.href.split('?')[0]; 
    copyToClipboard(baseUrl, "App link copied! Friends will start with an empty deck.");
});

// Scenario 2: Share App + Flashcards
shareCardsBtn.addEventListener('click', () => {
    if (flashcards.length === 0) {
        return alert("You don't have any cards to share yet!");
    }

    const baseUrl = window.location.href.split('?')[0];
    
    // Convert flashcards to a string, encode it safely for URLs, and compress it into base64
    const dataString = btoa(encodeURIComponent(JSON.stringify(flashcards)));
    
    const shareUrl = `${baseUrl}?data=${dataString}`;
    copyToClipboard(shareUrl, "Card link copied! Your friends will see exactly what you created.");
});