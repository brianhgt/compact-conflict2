// ==========================================================
// This part of the code initalizes a new game.
// ==========================================================

// keep the aspect of the gameplay area correct
(wnd.onresize = preserveAspect)();

// start the game
window.onload = function() {
    setTimeout(function() {
        gameSetup = getSetupFromStorage();
        setupAudio();
        runSetupScreen();
        setupTitleScreen();

        // resume an interrupted game, if there is one
        var savedGame = loadGame();
        if (savedGame) {
            prepareIngameUI(savedGame);
            showMap($('m'), savedGame);
            updateDisplay(savedGame);
            playOneMove(savedGame);
        }
    }, 500);
};

