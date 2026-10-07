// ==========================================================
// Prepares the whole sidebar on the left for gameplay use.
// ==========================================================

function prepareIngameUI(gameState) {
    // turn counter
    var html = div({i: 'tc', c: 'panel'});

    // player box area
    html += div({i: 'pd', c: 'panel panel-padded'}, map(gameState.p, function(player) {
        var pid = player.i;
        return div({
            i: 'pl' + pid,
            c: 'player-panel',
            style: 'background: ' + player.d
        }, player.n +
            div({c: 'player-stat', i: 'pr' + pid}) +
            div({c: 'player-stat', i: 'pc' + pid})
        );
    }).join(''));

    // info box
    html += div({c: 'panel panel-padded description', i: 'in'});

    // set it all
    $('d').innerHTML = html;

    // show stat box and undo button
    map(['mv', 'und', 'end'], show);
}

// ==========================================================
// This part of the code deals with responding to user actions.
// ==========================================================

var uiCallbacks = {};

// This is the handler that gets attached to most DOM elements.
// Delegation through UI callbacks allows us to react differently
// depending on game-state.
function invokeUICallback(object, type, event) {
	var cb = uiCallbacks[type];
	if (cb) {
        playSound(audioClick);
		cb(object);
	}
    if (event.target.href && event.target.href != "#")
        return 1;

    event.stopPropagation();
	return 0;
}

// This is one of the "player controller" methods - the one that
// is responsible for picking a move for a player. This one does
// that using a human and some UI, and calls reportMoveCallback
// with an object describing the move once its decided.
var uiState = {};
function uiPickMove(player, state, reportMoveCallback) {
	var cleanState = {
		b: [
			{t: 'Cancel move', h:1},
			{t: 'End turn'}
		]
	};

	uiCallbacks.c = function(region) {
        if ((!region) || (state.d.t == BUILD_ACTION))
            setCleanState();

        if (!state.d.s && region) {
            // no move in progress - start a new move if this is legal
            if (regionHasActiveArmy(state, player, region)) {
                setCleanState();
                state.d.t = MOVE_ARMY;
                state.d.s = region;
                state.d.c = soldierCount(state, region);
                state.d.b[0].h = 0;
                state.d.h = region.n.concat(region);
            }
        } else if (region) {
            // we already have a move in progress
            var decisionState = state.d;
            // what region did we click?
            if (region == decisionState.s) {
                // the one we're moving an army from - tweak soldier count
                decisionState.c = decisionState.c % soldierCount(state, region) + 1;
            } else if (decisionState.s.n.indexOf(region) > -1) {
                // one of the neighbours - let's finalize the move
                uiCallbacks = {};
                decisionState.d = region;
                return reportMoveCallback(decisionState);
            } else {
                // some random region - cancel move
                setCleanState();
            }
        }
		updateDisplay(state);
	};

    uiCallbacks.t = function(region) {
        var temple = state.t[region.i];
        state.d = {
            t: BUILD_ACTION,
            w: temple, r: region,
            b: makeUpgradeButtons(temple)
        };
        updateDisplay(state);
    };

    uiCallbacks.s = function(soldier) {
        // delegate to the region click handler, after finding out which region it is
        var soldierRegion = null;
        map(state.r, function(region) {
            if (contains(state.s[region.i], soldier))
                soldierRegion = region;
        });
        if (soldierRegion)
            uiCallbacks.c(soldierRegion);
    };

	uiCallbacks.b = function(which) {
        if (state.d && state.d.t == BUILD_ACTION) {
            // build buttons handled here
            if (which >= UPGRADES.length) {
                setCleanState();
            } else {
                // build an upgrade!
                state.d.u = UPGRADES[which];
                // if its a soldier, store UI state so it can be kept after the move is made
                if (state.d.u == SOLDIER)
                    uiState[player.i] = state.d.r;
                // report the move
                reportMoveCallback(state.d);
            }
        } else {
            // move action buttons handled here
            if (which == 1) {
                // end turn
                uiCallbacks = {};
                reportMoveCallback({t: END_TURN});
            } else {
                // cancel move
                setCleanState();
            }
        }
	};

    uiCallbacks.un = function() {
        // undo!
        performUndo(state);
    };

    setCleanState();
    if (uiState[player.i]) {
        uiCallbacks.t(uiState[player.i]);
        delete uiState[player.i];
    }

    function setCleanState() {
		state.d = deepCopy(cleanState, 3);
        state.d.h = state.r.filter(regionHasActiveArmy.bind(0, state, player));
		updateDisplay(state);
	}

    function makeUpgradeButtons(temple) {
        var templeOwner = owner(state, temple.r);
        var upgradeButtons = map(UPGRADES, function(upgrade) {
            // current upgrade level (either the level of the temple or number of soldiers bought already)
            var level = (temple.u == upgrade) ? (temple.l+1) : ((upgrade == SOLDIER) ? (state.m.h || 0) : 0);

            var cost = upgrade.c[level];
            var text = template(upgrade.n, LEVELS[level]) + elem('b', {}, " (" + cost + "&#9775;)");
            var description = template(upgrade.d, upgrade.x[level]);

            var hidden = false;
            hidden = hidden || (upgrade == RESPEC && (!temple.u)); // respec only available if temple is upgraded
            hidden = hidden || (temple.u && temple.u != upgrade && upgrade != SOLDIER && upgrade != RESPEC); // the temple is already upgraded with a different upgrade
            hidden = hidden || (level >= upgrade.c.length); // highest level reached
            hidden = hidden || (level < rawUpgradeLevel(state, templeOwner, upgrade)); // another temple has this upgrade already
            hidden = hidden || (templeOwner != player); // we're looking at an opponent's temple

            return {t: text, d: description, o: cost > cash(state, player), h: hidden};
        });
        upgradeButtons.push({t: "Done"});
        return upgradeButtons;
    }
}

// ==========================================================
// This part of the code helps organize game flow so things are displayed
// in order taking animation into account.
// ==========================================================

var oaatQueue = [];
function oneAtATime(duration, fn) {
    oaatQueue.push({d: duration, f: fn});
    if (oaatQueue.length == 1)
        runOneTask();

    function runOneTask() {
        // start the first scheduled task
        var task = oaatQueue[0];
        task.f();
        // and wait for it to expire
        setTimeout(function() {
            // task done, remove from queue
            oaatQueue.shift();
            // is there something more to do?
            if (oaatQueue.length)
                runOneTask();
        }, task.d);
    }
}

// ==========================================================
// This part of the code deals with updating the display to
// match the current game state.
// ==========================================================

var soldierDivsById = {};
function updateMapDisplay(gameState) {
    map(gameState.r, updateRegionDisplay);
    forEachProperty(gameState.t, updateTempleDisplay);

    var soldiersStillAlive = [];
    forEachProperty(gameState.s, function(soldiers, regionIndex) {
        map(soldiers, updateSoldierDisplay.bind(0, gameState.r[regionIndex]));
    });

    forEachProperty(soldierDivsById, function(div, id) {
        if (soldiersStillAlive.indexOf(parseInt(id)) < 0) {
            // this is an ex-div - in other words, the soldier it represented is dead
            $('m').removeChild(div);
            delete soldierDivsById[id]; // surprisingly, this should be safe to do during iteration - http://stackoverflow.com/a/19564686

            // spawn some particles
            var x = parseFloat(div.style.left), y = parseFloat(div.style.top);
            map(range(0,20), function() {
                var angle = Math.random() * 6.28, dist = rint(0,100) / 80;
                spawnParticle(x + sin(angle) * dist, y + cos(angle) * dist, 0, -1, '#000');
            });
        }
    });

    updateFloatingText();
    updateTooltips();
    updateSoldierTooltips();

    function updateRegionDisplay(region) {
        var regionOwner = owner(gameState, region);
        var gradientName = (regionOwner ? 'p' + regionOwner.i : 'l');

        var highlighted = contains(gameState.d && gameState.d.h || [], region) ||    // a region is highlighted if it has an available move
                          (gameState.e && regionOwner == gameState.e);               // - or belongs to the winner (end game display highlights the winner)

        // highlighting
        if (highlighted) {
            gradientName += 'h';
        }
        var highlightedOpacity = 0.1 + region.c[0] * 0.003;
        if (gameState.e || (gameState.d && gameState.d.s == region))
            highlightedOpacity *= 2;
        region.hl.style.opacity = highlighted ? highlightedOpacity : 0.0;
        region.hl.style.cursor = highlighted ? 'pointer' : 'default';

        // particles
        if (gameState.prt == region) {
            gameState.prt = 0; // only once
            map(region.p, function(point) {
                point = projectPoint(point);
                var center = region.c;
                var alpha = rint(30,100)/100;
                var startPoint = [lerp(alpha,center[0],point[0]), lerp(alpha,center[1],point[1])];
                var vx = (startPoint[0]-center[0]) / 2, vy = (startPoint[1]-center[1]) / 2 - 0.15;
                spawnParticle(startPoint[0], startPoint[1], vx, vy, '#fff');
            });
        }

        // fill
        region.e.style.fill = 'url(#' + gradientName + ')';
    }

    function updateTooltips() {
        map(doc.querySelectorAll('.tooltip'), $('m').removeChild.bind($('m')));
        if (activePlayer(gameState).u != uiPickMove) return;

        // "how to move" tooltips
        var source = gameState.d && gameState.d.s;
        if (source)  {
            showTooltipOver(source, "Click this region again to change the number of soldiers.");
            // pick the furthest neighbour
            var furthest = max(source.n, function(neighbour) {
                return Math.abs(source.c[0]-neighbour.c[0]) + Math.abs(source.c[1] - neighbour.c[1]);
            });
            showTooltipOver(furthest, "Click a bordering region to move.");
        }
        if (!source) {
            // "conquering armies cannot move" tooltips
            var inactiveArmies = gameState.m.z;
            if (inactiveArmies) {
                showTooltipOver(inactiveArmies[inactiveArmies.length-1], "Armies that conquer a new region cannot move again.")
                showTooltipOver({c: [-2, 80]}, "Once you're done, click 'End turn' here.");
            }
        }
        if (gameState.m.t == 2 && gameState.m.l == 2) {
            showTooltipOver({c:[90,93]}, "If you want to undo a move or check the rules, use the buttons here.", 15);
        }
    }

    function showTooltipOver(region, text, width) {
        if (gameSetup.tt[text]) return;
        setTimeout(function() {
            gameSetup.tt[text] = 1; // don't display it again (timeout to handle multiple updateDisplays() in a row)
            storeSetupInLocalStorage(gameSetup);
        }, 500);

        width = width || 7;
        var left = region.c[0] - (width+1) * 0.5, bottom = 102 - region.c[1];
        var styles = 'bottom: ' + bottom + '%; left: ' + left + '%; width: ' + width + '%';

        append('m', div({c: 'tooltip tooltip-target', s: styles}, text));
    }

    function updateTempleDisplay(temple) {
        var element = temple.e;

        // right color and right number of levels (corresponding to upgrade level)
        var templeLevels = temple.u ? (temple.l + 3) : 2;
        while (element) {
            element.style.display = (templeLevels > 0) ? 'block' : 'none';
            element.style.background = temple.u ? temple.u.b : '#999';

            templeLevels--;
            element = element.firstChild;
        }

        // which cursor should we use?
        var templeOwner = owner(gameState, temple.r);
        temple.e.style.cursor = (appState == APP_INGAME) ? ((templeOwner == activePlayer(gameState)) ? 'zoom-in' : 'help') : 'default';

        // highlight?
        var selected = gameState.d && gameState.d.w == temple;
        toggleClass(temple.e, 'selected', selected);
    }

    function updateSoldierDisplay(region, soldier, index) {
        // we're still alive, so no removing our <div>
        soldiersStillAlive.push(soldier.i);

        // find or create a <div> for showing the soldier
        var domElement = soldierDivsById[soldier.i];
        if (!domElement) {
            var html = div({c: 'soldier', s: 'display: none'});

            domElement = soldierDivsById[soldier.i] = append('m', html);
            onClickOrTap(domElement, invokeUICallback.bind(0, soldier, 's'));
        }

        // (re)calculate where the <div> should be
        var center = region.c;
        var totalSoldiers = soldierCount(gameState, region);

        var columnWidth = min([totalSoldiers,5]);
        var rowHeight = min([2 / ceil(totalSoldiers / 5), 1]);

        var x = index % 5, y = floor(index / 5);
        var xOffset = (-0.6 * columnWidth + x * 1.2);
        var yOffset = y * rowHeight + (gameState.t[region.i] ? 1.5 : 0);
        var xPosition = center[0] + xOffset - yOffset * 0.2;
        var yPosition = center[1] + xOffset * 0.2 + yOffset;

        if (soldier.a) {
            // we're attacking right now - move us closer to target region
            var targetCenter = soldier.a.c;
            xPosition = (xPosition + targetCenter[0]) / 2;
            yPosition = (yPosition + targetCenter[1]) / 2;
        }
        domElement.style.left = xPosition + '%';
        domElement.style.top  = yPosition + '%';
        domElement.style.zIndex = 20 + y * 5 + x;
        domElement.style.display = 'block';

        // selected?
        var decisionState = gameState.d || {};
        toggleClass(domElement, 'selected', (decisionState.s == region) && (index < decisionState.c));
    }

    function updateSoldierTooltips() {

        map(gameState.r, function(region, regionIndex) {
            var tooltipId = 'sc' + regionIndex;
            // delete previous tooltip, if present
            var tooltip = $(tooltipId);

            // should we have a tooltip?
            var count = soldierCount(gameState, region);
            if (count > 40) {
                var selected = (gameState.d && (gameState.d.s == region)) ? gameState.d.c : 0;
                selected += sum(gameState.s[regionIndex], function(soldier) {
                    return soldier.a ? 1 : 0;
                });
                if (selected)
                    count = selected + "<hr>" + count;

                if (!tooltip) {
                    var tooltipHTML = div({
                        i: tooltipId,
                        c: 'tooltip soldier-count-tooltip',
                        s: "left:" + (region.c[0] - 1.5) + '%;top:' + (region.c[1] + 1.2) + '%'
                    }, '');
                    tooltip = append('m', tooltipHTML);
                }
                tooltip.innerHTML = count;
            } else if (tooltip) {
                tooltip.parentNode.removeChild(tooltip);
            }
        });
    }

    function updateFloatingText() {
        map(gameState.flt || [], function(floater) {
            var x, y;
            if (floater.r) {
                x = floater.r.c[0]; y = floater.r.c[1];
            } else {
                var node = soldierDivsById[floater.s.i];
                x = parseFloat(node.style.left) + 0.2, y = parseFloat(node.style.top) + 0.2;
            }

            x -= floater.w/2 + 0.5; y -= 4;

            var styles = "left: " + x + "%;top:" + y + "%;color:" + floater.c + ";width:" + floater.w + "%";
            var floatingNode = append('m', div({c: 'tooltip', s: styles}, floater.t));
            setTransform(floatingNode, "translate3d(0,0,0)");
            floatAway(floatingNode, 0, -3);
        });
        gameState.flt = 0;
    }
}

function updateIngameUI(gameState) {
    var moveState = gameState.m;
    var decisionState = gameState.d;
    var buildingMode = decisionState && (decisionState.t == BUILD_ACTION);
    var movingArmy = decisionState && decisionState.s;

    var active = activePlayer(gameState);

    // turn counter/building name
    if (buildingMode) {
        var info = templeInfo(gameState, decisionState.w);
        $('tc').innerHTML = div({}, info.n) + div({c: 'description'}, info.d);
    } else {
        $('tc').innerHTML = 'Turn <b>' + gameState.m.t + '</b>' + ((gameSetup.tc != UNLIMITED_TURNS) ? ' / ' + gameSetup.tc : '');
    }

    // player data
    map(gameState.p, function(player, index) {
        //$('pl' + index).className = (index == moveState.p) ? 'pl' : 'pi'; // active or not?
        var regions = regionCount(gameState, player);
        var gameWinner = gameState.e;

        if (regions) {
            $('pr' + index).innerHTML = regionCount(gameState, player) + '&#9733;'; // region count
            if (gameWinner) {
                $('pc' + index).innerHTML = (gameWinner == player) ? '&#9819;' : '';
            } else {
                $('pc' + index).innerHTML = gameState.c[player.i] + '&#9775;'; // cash on hand
            }
        } else {
            $('pr' + index).innerHTML = '&#9760;'; // skull and crossbones, you're dead
            $('pc' + index).innerHTML = '';
        }
    });

    // move info
    var info;
    if (active.u == uiPickMove) {
        if (buildingMode) {
            if (owner(gameState, decisionState.r) == active)
                info = elem('p', {}, 'Choose an upgrade to build.');
            else
                info = '';
        } else if (movingArmy) {
            info = elem('p', {}, 'Click on this region again to choose how many to move.') +
                elem('p', {}, 'Click on a target region to move the army.');

        } else {

            info = elem('p', {}, 'Click on a region to move or attack with its army.') +
                elem('p', {}, 'Click on a temple to buy soldiers or upgrades with &#9775;.');
        }
    } else {
        info = elem('p', {}, active.n + ' is taking her turn.');
    }
    $('in').innerHTML = info;
    $('in').style.background = active.d;

    // active player stats
    $('pd').style.display =  buildingMode ? 'none' : 'block';
    $('mc').innerHTML = moveState.l + elem('span', {s: 'font-size: 80%'}, '&#10138;');
    $('ft').innerHTML = gameState.c[active.i] +  elem('span', {s: 'font-size: 80%'}, '&#9775;');

    // buttons
    updateButtons(decisionState && decisionState.b);

    // undo
    $('und').innerHTML = undoEnabled(gameState) ? "&#x21b6;" : "";
}

function updateButtons(buttons) {
    $('u').innerHTML = '';
    map(buttons || [], function(button, index) {
        if (button.h) return;

        var buttonContents = div({}, button.t);
        if (button.d)
            buttonContents += div({c: 'description'}, button.d);

        var buttonHTML = elem('a', {href: '#', c: button.o ? 'off' : ''}, buttonContents);
        var buttonNode = append('u', buttonHTML);
        if (!button.o) {
            onClickOrTap(buttonNode, invokeUICallback.bind(0, index, 'b'));
        }
    });
}

var displayedState;
function updateDisplay(gameState) {
    // just for debugging
    displayedState = gameState;

    // update the graphics
    updateMapDisplay(gameState);
    updateIngameUI(gameState);

    // make sounds!
    if (gameState.sc) {
        playSound(gameState.sc);
        gameState.sc = null;
    }
}

function showBanner(background, text, delay) {
    delay = delay || 1;
    oneAtATime(delay, function() {
        // create a new banner div
        var banner = append('c', div({c: 'game-banner'}, text)),
            styles = banner.style;

        styles.background = background;
        styles.opacity = 0.0;
        setTransform(banner, transform(-1));

        setTimeout(function() { styles.opacity = 1.0; setTransform(banner, transform(1)); }, 100),
        setTimeout(function() { styles.opacity = 1.0; }, 600),
        setTimeout(function() { styles.opacity = 0.0; }, 1100),
        setTimeout(function() { banner.parentNode.removeChild(banner); }, 1600)
    });

    function transform(offset) {
        return "translate3d(1.2em," + offset + "em,0) rotateY(" + (10 + offset * 2) + "deg)";
    }
}

function spawnParticle(x, y, vx, vy, color) {
    var styleString = "opacity:1;left: " + x + "%;top: " + y + "%;box-shadow: 0 0 1px 1px " + color;
    var particle = append('m', div({c: 'particle', s: styleString}, ''));
    floatAway(particle, vx, vy);
}

function floatAway(elem, vx, vy) {
    setTimeout(function() {
        setTransform(elem, "translate3d(" + vx + "em," + vy + "em,0)");
        elem.style.opacity = 0.0;
    }, 50);
    setTimeout(function() {
        $('m').removeChild(elem);
    }, 3050);
}

function preserveAspect() {
    setTimeout(function() {
        var w = wnd.innerWidth, h = wnd.innerHeight, aspect = 1.65, px = 'px';
        if (w / h > aspect) {
            w = h * aspect;
        } else {
            h = w / aspect;
        }

        var styles = $('c').style;
        styles.width = w + px;
        styles.height = h + px;
        styles.fontSize = 0.025 * h + px;
    }, 1);
}

function showEndGame(state) {
    oneAtATime(1, function() {
        var winner = state.e;
        if (winner != DRAW_GAME) {
            showBanner(winner.d, winner.n + " wins the game!");
        } else {
            showBanner('#333', "The game ends in a draw!");
        }

        updateDisplay(state);

        $('tc').innerHTML = "Game complete";
        $('in').innerHTML = elem('p', {}, "Click the button below to start a new game.");
        $('in').style.background = '#555';
        $('mv').style.display = 'none';
        updateButtons([{t: "New game"}]);

        uiCallbacks.b = runSetupScreen;
    });
}

// ==========================================================
// This is the code for the game setup screen.
// ==========================================================

var defaultSetup = {
    p: [PLAYER_HUMAN, PLAYER_AI, PLAYER_AI, PLAYER_OFF],
    l: AI_NICE,
    s: true,
    tc: 12,
    tt: {}
};
var gameSetup = getSetupFromStorage();
var appState = 0;

// Gets user preferences from local storage, or returns false if there aren't any.
function getSetupFromStorage() {
    if (localStorage) {
        var stored = localStorage.getItem("s");
        if (stored) {
            stored = JSON.parse(stored);
            forEachProperty(defaultSetup, function (value, name) {
                if (stored[name] === undefined)
                    stored[name] = value;
            });
            return stored;
        }
    }

    return defaultSetup;
}

// Tries to store user preferences in local storage.
function storeSetupInLocalStorage() {
    if (localStorage) {
        localStorage.setItem("s", JSON.stringify(gameSetup));
    }
}

function prepareSetupUI() {
    // player box area
    var html = div({c: 'panel description'}, "Player setup");
    var playerBoxes = map(PLAYER_TEMPLATES, function(player) {
        var pid = player.i;
        return buttonPanel(player.n, "sb" + player.i, ["AI", "Human", "Off"], {
            i: 'pl' + pid,
            c: 'player-panel',
            s: 'background: ' + player.d
        });
    }).join("");
    html += div({i: 'pd', c: 'panel panel-padded'}, playerBoxes);
    html += buttonPanel("AI", "ai", ["Evil", "Mean", "Rude", "Nice"]);
    html += buttonPanel("Turns", "tc", ["Endless", "15", "12", "9"]);

    // realize the UI
    $('d').innerHTML = html;

    // hide stat box and undo button
    map(['mv', 'und', 'end'], hide);

    // setup callbacks for players
    for2d(0, 0, PLAYER_TEMPLATES.length, 3, function(playerIndex, buttonIndex) {
        onClickOrTap($('sb' + playerIndex + buttonIndex), invokeUICallback.bind(0, {p: playerIndex, b: buttonIndex}, 'sb'));
    });
    map(range(0,4), function(index) {
        onClickOrTap($('ai' + index), invokeUICallback.bind(0, index, 'ai'));
        onClickOrTap($('tc' + index), invokeUICallback.bind(0, TURN_COUNTS[index], 'tc'));
    });

    function buttonPanel(title, buttonIdPrefix, buttonLabels, additionalProperties) {
        var buttons = map(buttonLabels, function(label, index) {
            var id = buttonIdPrefix + (buttonLabels.length-1-index);
            return elem('a', {i: id, c: 'action-button', href: '#', s: 'font-size: 90%'}, label);
        }).join("");
        var properties = {c: 'panel description', s: 'padding-right: 0.5em'};
        forEachProperty(additionalProperties, function(value, name) {
            properties[name] = value;
        });
        return div(properties, title + buttons);
    }
}

function runSetupScreen() {
    // we're in setup now
    appState = APP_SETUP_SCREEN;

    // generate initial setup and game state
    var game;
    regenerateMap();

    // prepare UI
    prepareSetupUI();
    updateBottomButtons();
    updateConfigButtons();

    // callback for the buttons on the bottom
    uiCallbacks.b = function(which) {
        if (!setupValid()) return;
        if (which == 0) {
            regenerateMap();
        } else {
            prepareIngameUI(game);
            updateDisplay(game);
            playOneMove(game);
        }
    };
    // callback for player setup buttons
    uiCallbacks.sb = function(event) {
        // set the controller type for the player
        gameSetup.p[event.p] = event.b;
        updateConfigButtons();
        updateBottomButtons();
        regenerateMap();
    };
    // callback for config buttons
    uiCallbacks.ai = function(aiLevel) {
        gameSetup.l = aiLevel;
        updateConfigButtons();
    };
    uiCallbacks.tc = function(turnCount) {
        gameSetup.tc = turnCount;
        updateConfigButtons();
    };

    function setupValid() {
        var enabledPlayers = sum(gameSetup.p, function(playerState) {
            return (playerState != PLAYER_OFF) ? 1 : 0;
        });
        return enabledPlayers > 1;
    }

    function updateBottomButtons() {
        var buttonsDisabled = !setupValid();
        updateButtons([
            {t: "Change map", o: buttonsDisabled},
            {t: "Start game", o: buttonsDisabled}
        ]);
    }

    function updateConfigButtons() {
        // somebody changed something, so store the new setup
        storeSetupInLocalStorage(gameSetup);

        // update player buttons
        map(gameSetup.p, function(controller, playerIndex) {
           map(range(0,3), function(buttonIndex) {
               toggleClass('sb' + playerIndex + buttonIndex, 'selected', (controller == buttonIndex));
           })
        });

        // update AI and turn count buttons
        map(range(0,4), function(index) {
            toggleClass('ai' + index, 'selected', index == gameSetup.l);
            toggleClass('tc' + index, 'selected', TURN_COUNTS[index] == gameSetup.tc);
        });
    }

    function regenerateMap() {
        if (setupValid()) {
            game = makeInitialState(gameSetup);
            showMap($('m'), game);
            updateMapDisplay(game);
        }
    }
}

// ==========================================================
// This part of the code is responsible for the meager functionality
// of the title screen.
// ==========================================================

function setupTitleScreen() {
    map(['o','tub','snd'], function(id) {showOrHide(id,1);});

    onClickOrTap($('cb'), setTitleScreenVisibility.bind(0,false));
    onClickOrTap($('nxt'), switchTutorialCard.bind(0,1));
    onClickOrTap($('prv'), switchTutorialCard.bind(0,-1));

    onClickOrTap($('tub'), setTitleScreenVisibility.bind(0,true));
    onClickOrTap($('snd'), toggleSound);
    onClickOrTap($('und'), invokeUICallback.bind(0, 0, 'un'));
    onClickOrTap($('end'), function() {
        clearSavedGame();
        uiCallbacks = {};
        updateDisplay(displayedState);
        runSetupScreen();
    });

    switchTutorialCard(0);

    setTimeout(setTitleScreenVisibility.bind(0,true), 10);
}

var currentCard = 0, totalCards = 5;
function switchTutorialCard(direction) {
    currentCard = clamp(currentCard + direction, 0, totalCards-1);

    setTransform($('tuc'), "translate3d(" + (-currentCard * 100 / totalCards) + "%,0,0)");
    showOrHide('prv', currentCard > 0);
    showOrHide('nxt', currentCard < totalCards - 1);
}

function setTitleScreenVisibility(visible) {
    if (visible) {
        $('ts').style.display = 'block';
    }

    setTimeout(function() {
        toggleClass('ts', 'h', !visible);
    }, 50);

    if (!visible) {
        setTimeout(function () {
            $('ts').style.display = 'none';
        }, 500);
    }
}
