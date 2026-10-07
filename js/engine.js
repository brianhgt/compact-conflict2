// ==========================================================
// Game-controlling constants
// ==========================================================

var mapWidth = 30, 
	mapHeight = 20, 
	movesPerTurn = 3,
    minimumAIThinkingTime = 1000,
    maximumAIThinkingTime = 5000;

// ==========================================================
// Game data
// ==========================================================

// === The possible move types
var MOVE_ARMY = 1, BUILD_ACTION = 2, END_TURN = 3;

// === Player properties
var PLAYER_TEMPLATES = [
    {i:0, n: 'Amber', l: '#fd8', d:'#960', h: '#fd8', hd:'#a80'},
    {i:1, n: 'Crimson', l: '#f88', d:'#722', h: '#faa', hd:'#944'},
    {i:2, n: 'Lavender', l: '#d9d', d:'#537', h: '#faf', hd:'#759'},
    {i:3, n: 'Emerald', l: '#9d9', d:'#262', h: '#bfb', hd:'#484'}
];

// === Possible temple upgrades
var UPGRADES = [
    {n: "Extra soldier", d: "", c: map(range(0,100), function(n) { return 8 + n * 4; }), x: []},
    {n: "X of Water", d: "Income: X% more each turn.",
        c: [15, 25], x: [20, 40],
        b: '#66f'},
    {n: "X of Fire",  d: "Attack: X invincible soldier(s).",
        c: [20, 30], x: [1, 2],
        b: '#f88'},
    {n: "X of Air",   d: "Move: X extra move(s) per turn.",
        c: [25, 35], x: [1, 2],
        b: '#ffa'},
    {n: "X of Earth", d: "Defense: Always kill X invader(s).",
        c: [30, 45], x: [1, 2],
        b: '#696'},
    {n: "Rebuild temple", d: "Switch to a different upgrade.",
        c: [0], x: []}
    ],
    LEVELS = ["Temple", "Cathedral"],
    SOLDIER = UPGRADES[0], WATER = UPGRADES[1], FIRE = UPGRADES[2], AIR = UPGRADES[3], EARTH = UPGRADES[4], RESPEC = UPGRADES[5];

// === Constants for setup screen
var PLAYER_OFF = 0, PLAYER_HUMAN = 1, PLAYER_AI = 2;
var AI_NICE = 0, AI_RUDE = 1, AI_MEAN = 2, AI_EVIL = 3;
var UNLIMITED_TURNS = 1000000, TURN_COUNTS = [9, 12, 15, UNLIMITED_TURNS];

// == Application "states"
var APP_SETUP_SCREEN = 0, APP_INGAME = 1;

// == Special "player" for signifying a draw game
var DRAW_GAME = {};

// == AI personalities - how eagerly it builds soldiers, and what upgrades it prefers
var AI_PERSONALITIES = [
    {s: 1, u:[]},
    {s: 0.2, u: [WATER, EARTH]},
    {s: 0.25, u: [WATER, FIRE, FIRE]},
    {s: 0.15, u: [WATER, WATER, EARTH, EARTH]},
    {s: 0.4, u: [WATER]},
    {s: 0.3, u: [WATER, WATER]},
    {s: 0.25, u: [FIRE, FIRE]},
    {s: 0.2, u: [EARTH, EARTH]}
];

// ==========================================================
// Preparing the initial game state happens here
// ==========================================================

function makeInitialState(setup) {
    var players = [];
    map(setup.p, function(playerController, playerIndex) {
        if (playerController == PLAYER_OFF) return;
        var player = deepCopy(PLAYER_TEMPLATES[playerIndex], 1);

        // set up as AI/human
        player.u = (playerController == PLAYER_HUMAN) ? uiPickMove : aiPickMove;
        // pick a random personality if we're AI
        if (playerController == PLAYER_AI) {
            player.p = deepCopy(AI_PERSONALITIES[rint(0, AI_PERSONALITIES.length)], 2);
        }

        player.i = players.length;
        players.push(player);
    });

	var regions = generateMap(players.length);
	var gameState = {
		p: players,
		r: regions,
		o: {}, t: {}, s: {}, c: {}, l: {},
		m: {t: 1, p: 0, m: MOVE_ARMY, l: movesPerTurn}
	};
	
	setupTemples();

	return gameState;



    function distance(regionA, regionB) {
        // breadth-first search!
        var queue = [{r: regionA, d:0}], visited = [regionA], answer = -1, bound = 100;

        while (answer < 0) {
            var item = queue.shift(), region = item.r, distanceFromA = item.d;
            if (region == regionB) {
                // we've found the region!
                answer = distanceFromA;
            } else if (distanceFromA >= bound) {
                // we've reached our established upper bound - return it
                answer = bound;
            } else {
                // use memoized values to establish an upper bound (we still might do better,
                // but we can't do worse)
                if (region.d[regionB.i])
                    bound = min([bound, region.d[regionB.i] + distanceFromA]);

                // look in all unvisited neighbours
                map(region.n, function (neighbour) {
                    if (!contains(visited, neighbour))
                        queue.push({r: neighbour, d: distanceFromA + 1});
                });
                visited.push(region);
            }
        }

        // memoize result for later and return
        regionA.d[regionB.i] = regionB.d[regionA.i] = answer;
        return answer;
    }

	function distanceScore(regions) {
		return min(pairwise(regions, distance));
	}

	function randomRegion() {
		return regions[rint(0, regions.length)];
	}
 
	function setupTemples() {
		// give the players some cash (or not)
		map(players, function(player, index) {
			gameState.c[index] = gameState.l[index] = 0;
		});

		// pick three regions that are as far away as possible from each other
		// for the players' initial temples
		var possibleSetups = map(range(0,1000), function() {
			return map(gameState.p, randomRegion);
		});
		var homes = max(possibleSetups, distanceScore);

		// we have the regions, set up each player
		map(players, function(player, index) {
			var region = homes[index];
			// make one of the regions your own
			gameState.o[region.i] = player;
			// put a temple and 3 soldiers in it
			putTemple(region, 3);
		});

		// setup neutral temples
        var distancesToTemples = map(homes, function() { return 0; });
        var templeRegions = [];
        var templeCount = [3,3,4][players.length-2];

		map(range(0,templeCount), function() {
			var bestRegion = max(gameState.r, function(region) {
				return templeScore(region);
			});

            putTemple(bestRegion, 3);

            templeRegions.push(bestRegion);
            distancesToTemples = updatedDistances(bestRegion);
		});

        function updatedDistances(newTemple) {
            return map(homes, function(home, index) {
                return distancesToTemples[index] + distance(home, newTemple);
            });
        }

        function templeScore(newTemple) {
            if (contains(templeRegions, newTemple))
                return -100;

            var updated = updatedDistances(newTemple);
            var inequality = max(updated) - min(updated);
            var templeDistances = distanceScore(templeRegions.concat(homes).concat(newTemple));
            if (!templeDistances)
                templeDistances = -5;

            return templeDistances - inequality;
        }
	}

	function putTemple(region, soldierCount) {
		var index = region.i;
		gameState.t[index] = {r: region, i: index};
		addSoldiers(gameState, region, soldierCount);
	}
}

// ==========================================================
// All the game logic and the machinery that runs its main
// loop reside below.
// ==========================================================

/**
 * Asks the UI (for humans) or the AI (for CPU players) to pick
 * the next move to make in the game. This happens asynchronously.
 *
 * @param player the player to move
 * @param state the state in which to make the move
 * @param reportMoveCallback should be called with the desired move as parameter once the decision is made
 */
function pickMove(player, state, reportMoveCallback) {
    // automatically end the turn of dead players
    if (!regionCount(state, player))
        return reportMoveCallback({t: END_TURN});

	// delegate to whoever handles this player
    player.u(player, state, reportMoveCallback);
}

/**
 * Takes an existing state and a move, and returns a new game state with the move
 * already applied. The object returned is a copy and the original is left untouched.
 *
 * @param state an existing game state
 * @param move the move to be applied by the active players
 * @returns {GameState} the game state after this move
 */
function makeMove(state, move) {
	state = copyState(state);
	
	var moveType = move.t;
	if (moveType == MOVE_ARMY) {
        moveSoldiers(state, move.s, move.d, move.c);
    } else if (moveType == BUILD_ACTION) {
        buildUpgrade(state, move.r, move.u);
	} else if (moveType == END_TURN) {
		nextTurn(state);
	}

    // updates that happen after each move (checking for players losing, etc.)
    afterMoveChecks(state);

	return state;
}

function copyState(state, simulatingPlayer) {
	return {
		// some things are constant and can be shallowly copied
		r: state.r, 
		p: state.p,
        a: state.a || simulatingPlayer,
		// some others... less so
		m: deepCopy(state.m, 1),
		o: deepCopy(state.o, 1),
		t: deepCopy(state.t, 2),
		s: deepCopy(state.s, 3),
		c: deepCopy(state.c, 1),
        l: deepCopy(state.l, 1),
        flt: state.flt
		// and some others are completely omitted - namely 'd', the current 'move decision' partial state
	};
}

// ==========================================================
// Saving and restoring the game, so it survives a browser restart.
// ==========================================================

var SAVE_KEY = "g", SAVE_VERSION = 1;

function serializeState(state) {
    var data = {
        v: SAVE_VERSION, tc: gameSetup.tc, al: gameSetup.l,
        r: map(state.r, function(region) {
            return {p: region.p, n: map(region.n, function(n) { return n.i; })};
        }),
        p: map(state.p, function(player) {
            var template = 0;
            map(PLAYER_TEMPLATES, function(t, index) { if (t.n == player.n) template = index; });
            return {
                t: template,
                h: player.u == uiPickMove,
                p: player.p && {s: player.p.s, u: map(player.p.u, function(u) { return UPGRADES.indexOf(u); })}
            };
        }),
        o: {}, t: {}, s: {},
        c: state.c, l: state.l,
        m: deepCopy(state.m, 1)
    };
    data.m.z = map(state.m.z || [], function(region) { return region.i; });
    forEachProperty(state.o, function(player, regionIndex) { data.o[regionIndex] = player.i; });
    forEachProperty(state.t, function(temple, regionIndex) {
        data.t[regionIndex] = {u: temple.u ? UPGRADES.indexOf(temple.u) : -1, l: temple.l};
    });
    forEachProperty(state.s, function(soldiers, regionIndex) {
        data.s[regionIndex] = map(soldiers, function(soldier) { return soldier.i; });
    });
    return data;
}

function deserializeState(data) {
    var regions = map(data.r, function(r, index) { return {i: index, p: r.p, d: []}; });
    map(regions, function(region, index) {
        region.n = map(data.r[index].n, function(n) { return regions[n]; });
    });

    var players = map(data.p, function(pd, index) {
        var player = deepCopy(PLAYER_TEMPLATES[pd.t], 1);
        player.i = index;
        player.u = pd.h ? uiPickMove : aiPickMove;
        if (pd.p)
            player.p = {s: pd.p.s, u: map(pd.p.u, function(u) { return UPGRADES[u]; })};
        return player;
    });

    var state = {p: players, r: regions, o: {}, t: {}, s: {}, c: data.c, l: data.l, m: data.m};
    state.m.z = map(data.m.z, function(regionIndex) { return regions[regionIndex]; });
    if (!state.m.z.length)
        delete state.m.z;

    forEachProperty(data.o, function(playerIndex, regionIndex) { state.o[regionIndex] = players[playerIndex]; });
    forEachProperty(data.t, function(t, regionIndex) {
        var temple = {r: regions[regionIndex], i: parseInt(regionIndex)};
        if (t.u >= 0) {
            temple.u = UPGRADES[t.u];
            temple.l = t.l;
        }
        state.t[regionIndex] = temple;
    });
    var highestSoldierId = 0;
    forEachProperty(data.s, function(ids, regionIndex) {
        state.s[regionIndex] = map(ids, function(id) {
            highestSoldierId = max([highestSoldierId, id]);
            return {i: id};
        });
    });
    soldierCounter = highestSoldierId + 1;

    return state;
}

function saveGame(state) {
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(serializeState(state)));
    } catch (e) {}
}

function clearSavedGame() {
    try {
        localStorage.removeItem(SAVE_KEY);
    } catch (e) {}
}

// Returns the saved game state (and restores the matching settings), or null if there is none.
function loadGame() {
    try {
        var data = JSON.parse(localStorage.getItem(SAVE_KEY));
        if (!data || data.v != SAVE_VERSION)
            return null;
        var state = deserializeState(data);
        gameSetup.tc = data.tc;
        gameSetup.l = data.al;
        return state;
    } catch (e) {
        clearSavedGame();
        return null;
    }
}

function playOneMove(state) {
    // we're playing the game now
    appState = APP_INGAME;
    saveGame(state);

    // oneAtATime is used to ensure that all animations from previous moves complete before a new one is played
    oneAtATime(150, function() {
        var controllingPlayer = activePlayer(state); // who is the active player to make some kind of move?

        // let the player pick their move using UI or AI
        pickMove(controllingPlayer, state, function(move) {
            // AI makes sounds when playing
            if (controllingPlayer.u == aiPickMove)
                playSound(audioClick);

            // the move is chosen - update state to a new immutable copy
            var newState = makeMove(state, move);
            // did the game end?
            if (newState.e) {
                // yes, the game has ended
                clearSavedGame();
                oneAtATime(150, updateDisplay.bind(0, newState));
                showEndGame(newState);
                return;
            } else {
                // remember state for undo purposes
                previousState = copyState(state);
                // still more of the game to go - next move, please!
                setTimeout(playOneMove.bind(0, newState), 1);
            }
        });

        // update display before the move happens
        updateDisplay(state);
    });
}

function afterMoveChecks(state) {
    // check for game loss by any of the players
    map(state.p, function(player) {
        var totalSoldiers = sum(state.r, function(region) {
            return owner(state, region) == player ? soldierCount(state, region) : 0;
        });
        if (!totalSoldiers && regionCount(state, player)) {
            // lost!
            forEachProperty(state.o, function(p, r) {
                if (player == p)
                    delete state.o[r];
            });
            // dead people get no more moves
            if (activePlayer(state) == player)
                state.m.l = 0;
            // show the world the good (or bad) news
            if (!state.a) {
                oneAtATime(150, updateDisplay.bind(0, state));
                showBanner('#222', player.n + " has been eliminated!", 900);
            }
        }
    });

    // do we still have more than one player?
    var gameStillOn = state.p.filter(regionCount.bind(0, state)).length > 1;
    if (!gameStillOn) {
        // oh gosh, it's done - by elimination!
        state.e = determineGameWinner(state);
        return;
    }
}

var soldierCounter;
function addSoldiers(state, region, count) {
    map(range(0,count), function() {
        soldierCounter = (soldierCounter + 1) || 0;

        var soldierList = state.s[region.i];
        if (!soldierList)
            soldierList = state.s[region.i] = [];

        soldierList.push({
            i: soldierCounter++
        });
    });
}

function moveSoldiers(state, fromRegion, toRegion, incomingSoldiers) {
	var fromList = state.s[fromRegion.i];
	var toList = state.s[toRegion.i] || (state.s[toRegion.i] = []);
	var fromOwner = owner(state, fromRegion);
	var toOwner = owner(state, toRegion);

	// do we have a fight?
	if (fromOwner != toOwner) {
        var defendingSoldiers = toList.length;

        // earth upgrade - preemptive damage on defense
        var preemptiveDamage = min([incomingSoldiers, upgradeLevel(state, toOwner, EARTH)]);
        var invincibility = upgradeLevel(state, fromOwner, FIRE);

        if (preemptiveDamage || defendingSoldiers) {
            // there will be a battle - move the soldiers halfway for animation
            if (!state.a) {
                map(fromList.slice(0, incomingSoldiers), function (soldier) {
                    soldier.a = toRegion;
                });
            }
            battleAnimationKeyframe(state);
        }

        if (preemptiveDamage) {
            // animate it
            battleAnimationKeyframe(state, 50, audioOursDead, [{s: fromList[0], t: "Earth kills " + preemptiveDamage + "!", c: EARTH.b, w: 9}]);
            // apply it
            map(range(0, preemptiveDamage), function () {
                fromList.shift();
                incomingSoldiers--;
            });
            battleAnimationKeyframe(state);
        }

        // if there is still defense and offense, let's have a fight
		if (defendingSoldiers && incomingSoldiers) {
            // at this point, the outcome becomes random - so you can't undo your way out of it
            state.u = 1;

            var incomingStrength = incomingSoldiers * (1 + upgradeLevel(state, fromOwner, FIRE) * 0.01);
            var defendingStrength = defendingSoldiers * (1 + upgradeLevel(state, toOwner, EARTH) * 0.01);

			var repeats = min([incomingSoldiers, defendingSoldiers]);
			var attackerWinChance = 100 * Math.pow(incomingStrength / defendingStrength, 1.6);

            function randomNumberForFight(index) {
                var maximum = 120 + attackerWinChance;
                if (state.a) {
                    // simulated fight - return some numbers
                    // they're clustered about the center of the range to
                    // make the AI more "decisive" (this exaggerates any advantages)
                    return (index + 3) * maximum / (repeats + 5);
                } else {
                    // not a simulated fight - return a real random number
                    // we're not using the full range 0 to maximum to make sure
                    // that randomness doesn't give a feel-bad experience when
                    // we attack with a giant advantage
                    return rint(maximum * 0.12, maximum * 0.88);
                }
            }

            map(range(0,repeats), function(index) {
				if (randomNumberForFight(index) <= 120)
                {
                    // defender wins!
                    if (invincibility-- <= 0) {
                        fromList.shift();
                        incomingSoldiers--;
                        battleAnimationKeyframe(state, 250, audioOursDead);
                    } else {
                        battleAnimationKeyframe(state, 800, audioOursDead, [{s: fromList[0], t: "Protected by Fire!", c: FIRE.b, w: 11}]);
                    }
                } else {
                    // attacker wins, kill defender and pay the martyr bonus
                    toList.shift();
                    if (toOwner)
                        state.c[toOwner.i] += 4;
                    battleAnimationKeyframe(state, 250, audioEnemyDead);
                }
			});

            // are there defenders left?
            if (toList.length) {
                // and prevent anybody from moving in
                incomingSoldiers = 0;
                state.sc = audioDefeat;
                state.flt = [{r: toRegion, c: toOwner ? toOwner.h : '#fff', t: "Defended!", w: 7}];
            }
		}

        // reset "attacking status" on the soldiers - at this point they will
        // move back to the source region or occupy the destination
        map(fromList, function(soldier) {
            soldier.a = 0;
        });
	}

	if (incomingSoldiers > 0) {
		// move the (remaining) soldiers
		map(range(0, incomingSoldiers), function() {
			toList.push(fromList.shift());
		});

		// if this didn't belong to us, it now does
        if (fromOwner != toOwner) {
            state.o[toRegion.i] = fromOwner;
            // mark as conquered to prevent moves from this region in the same turn
            state.m.z = (state.m.z || []).concat(toRegion);
            // if there was a temple, reset its upgrades
            var temple = state.t[toRegion.i];
            if (temple)
                delete temple.u;
            // play sound, launch particles!
            state.prt = toRegion;
            state.flt = [{r: toRegion, c: fromOwner.h, t: "Conquered!", w: 7}];
            state.sc = defendingSoldiers ? audioVictory : audioTakeOver;
        }
    }

	// use up the move
    state.m.l--;
}

function battleAnimationKeyframe(state, delay, soundCue, floatingTexts) {
    if (state.a) return;
    var keyframe = copyState(state);
    keyframe.sc = soundCue;
    keyframe.flt = floatingTexts;
    oneAtATime(delay || 500, updateDisplay.bind(0, keyframe));
}

function buildUpgrade(state, region, upgrade) {
    var temple = state.t[region.i];
    var templeOwner = owner(state, region);

    if (upgrade == SOLDIER) {
        // soldiers work diferently - they get progressively more expensive the more you buy in one turn
        if (!state.m.h)
            state.m.h = 0;
        state.c[templeOwner.i] -= upgrade.c[state.m.h++];
        return addSoldiers(state, region, 1);
    }
    if (upgrade == RESPEC) {
        // respeccing is also different
        delete temple.u;
        return;
    }

    // upgrade the temple
    if (temple.u != upgrade) {
        // fresh level 1 upgrade!
        temple.u = upgrade;
        temple.l = 0;
    } else {
        // upgrade to a higher level
        temple.l++;
    }

    // you have to pay for it, unfortunately
    state.c[templeOwner.i] -= upgrade.c[temple.l];

    // particles!
    state.prt = temple.r;

    // the AIR upgrade takes effect immediately
    if (upgrade == AIR)
        state.m.l++;
}

function nextTurn(state) {
	var player = activePlayer(state);
	
	// cash is produced
    var playerIncome = income(state, player);
    state.c[player.i] += playerIncome;
    if (playerIncome) {
        state.flt = [{r: temples(state, player)[0].r, t: "+" + playerIncome + "&#9775;", c: '#fff', w: 5}];
    }

	// temples produce one soldier per turn automatically
	forEachProperty(state.t, function(temple, regionIndex) {
		if (state.o[regionIndex] == player) {
			// this is our temple, add a soldier of the temple's element
			addSoldiers(state, temple.r, 1);
		}
	});

	// go to next player (skipping dead ones)
    do {
        var playerCount = state.p.length;
        var playerIndex = (state.m.p + 1) % playerCount, upcomingPlayer = state.p[playerIndex],
            turnNumber = state.m.t + (playerIndex ? 0 : 1);
        state.m = {t: turnNumber, p: playerIndex, m: MOVE_ARMY, l: movesPerTurn + upgradeLevel(state, upcomingPlayer, AIR)};
    } while (!regionCount(state, upcomingPlayer));

    // did the game end by any chance?
    if (state.m.t > gameSetup.tc) {
        // end the game!
        state.m.t = gameSetup.tc;
        state.e = determineGameWinner(state);
        return;
    }

    // if this is not simulated, we'd like a banner
    if (!state.a) {
        // show next turn banner
        showBanner(activePlayer(state).d, activePlayer(state).n + "'s turn");
    }
}

function determineGameWinner(state) {
    var pointsFn = regionCount.bind(0, state);
    var winner = max(state.p, pointsFn);
    var otherPlayers = state.p.filter(function(player) { return player != winner; });
    var runnerUp = max(otherPlayers, pointsFn);

    return (pointsFn(winner) != pointsFn(runnerUp)) ? winner : DRAW_GAME;
}

// ==========================================================
// Various simple helpers for working with the game state.
// ==========================================================

function soldierCount(state, region) {
	var list = state.s[region.i];
	return list ? list.length : 0;
}

function income(state, player) {
    // no income with no temples
    var playerTemples = temples(state,player);
    if (!playerTemples.length) return 0;

    // 1 faith per region
    var fromRegions = regionCount(state, player);
    // 1 faith per each soldier at temple (too much?)
    var fromTemples = sum(playerTemples, function(temple) {
        return soldierCount(state, temple.r);
    });
    var multiplier = 1.0 + 0.01 * upgradeLevel(state, player, WATER);
    if ((player.u == aiPickMove) && (gameSetup.l == AI_EVIL))
        multiplier += 0.4;
    return ceil(multiplier * (fromRegions + fromTemples));
}

function regionHasActiveArmy(state, player, region) {
    return (state.m.l > 0) && (owner(state, region) == player) && soldierCount(state, region) && (!contains(state.m.z, region));
}

function regionCount(state, player) {
	var total = 0;
	map(state.r, function(region) {
		if (owner(state, region) == player)
			total++;
	});
	return total;
}

function temples(state, player) {
    var temples = [];
    forEachProperty(state.t, function(temple, regionIndex) {
        if (state.o[regionIndex] == player)
            temples.push(temple);
    });
    return temples;
}

function activePlayer(state) {
    return state.p[state.m.p];
}

function owner(state, region) {
    return state.o[region.i];
}

function cash(state, player) {
    return state.c[player.i];
}

function rawUpgradeLevel(state, player, upgradeType) {
    return max(map(temples(state, player), function(temple) {
        if (temple.u && temple.u == upgradeType)
            return temple.l + 1;
        else
            return 0;
    }).concat(0));
}

function upgradeLevel(state, player, upgradeType) {
    if (!player) {
        // neutral forces always have upgrade level 0;
        return 0;
    }

    return max(map(state.r, function(region) {
        // does it have a temple?
        var temple = state.t[region.i];
        if (!temple) return 0;
        // does it belong to us?
        if (owner(state, region) != player) return 0;
        // does it have the right type of upgrade?
        return (temple.u == upgradeType) ? upgradeType.x[temple.l] : 0;
    }));
}

function totalSoldiers(state, player) {
    return sum(state.r, function(region) {
        return (owner(state, region) == player) ? soldierCount(state, region) : 0;
    });
}

function soldierCost(state) {
    return SOLDIER.c[state.m.h || 0];
}

function templeInfo(state, temple) {
    if (!temple.u) {
        var name = owner(state, temple.r) ? "Basic Temple" : "Neutral Temple";
        return {n: name, d: "No upgrades."};
    } else {
        var upgrade = temple.u, level = temple.l,
            description = template(upgrade.d, upgrade.x[level]);
        return {n: template(upgrade.n, LEVELS[level]), d: description};
    }
}

// ==========================================================
// Undo functionality
// ==========================================================

var previousState = null;

function undoEnabled(gameState) {
    return previousState && // there is a state to return to
        (activePlayer(previousState) == activePlayer(gameState)) &&  // and it was actually our move
        (!gameState.u) && // and undo wasn't expressly disabled after a battle
        (activePlayer(gameState).u == uiPickMove); // and no using Undo on behalf of the AI!
}

function performUndo(currentState) {
    if (!undoEnabled(currentState))
        return;

    // clear the callbacks from previous UI interaction
    uiCallbacks = {};

    // roll back the state to "previous"
    var restoredState = previousState;
    previousState = null;
    playOneMove(restoredState);
}
