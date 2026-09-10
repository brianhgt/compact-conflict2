// ==========================================================
// This part of the code deals with procedural map generation
// prior to gameplay.
// ==========================================================

// Generates a new map for a given number of players.
function generateMap(playerCount) {
    var maxRegionSize = 11 - playerCount;
    var neededRegions = 13 + playerCount * 3;
    var perturbConst = rint(10000,100000);

    var regionMap, regions, count, retries;

    // Repeat until we get a workable map
    do {
        regionMap = range(0,mapWidth).map(function(){return []});
        regions = []; count = 0; retries = 2500;

        // The main loop is repeated only a limited number of times to
        // handle cases where the map generator runs into a dead end.
        while ((count < neededRegions) && (--retries > 0)) {
            // create a random region
            var bounds = {
                l: rint(1, mapWidth - maxRegionSize + 1),
                t: rint(1, mapHeight - maxRegionSize + 1),
                w: rint(3, maxRegionSize), h: rint(3, maxRegionSize)
            };
            // it has to overlap one of the existing ones
            if (count && !overlaps(bounds)) continue;

            // we shrink it until it no longer overlaps - this guarantees
            // that it will border at least one other region, making the map
            // contiguous
            while (!shrink(bounds)) {
                if (!overlaps(bounds)) {
                    regions.push(makeRegionAt(count++, bounds));
                    break;
                }
            }
        }
    } while (!retries);

	fillNeighbourLists();	
	return regions;

    // Shrink the region given by 'bounds' in a random direction
	function shrink(bounds) {
		var r = rint(0,4);
		if (r % 2) bounds.w--; else bounds.h--;
		if (r == 2) bounds.t++;
		if (r == 3) bounds.l++;
		return (bounds.w * bounds.h < 9);
	}

    // Checks if the region given by 'bounds' overlaps any existing region.
	function overlaps(bounds) {
		var rv = false;
		for2d(bounds.l, bounds.t, bounds.l+bounds.w, bounds.t+bounds.h, function(x,y) {
			rv = rv || regionMap[x][y];
		});
		return rv;
	}

    // Puts a new rectangular region at the position given in bounds {Left, Top, Width, Height}.
	function makeRegionAt(index, bounds) {
		// make points for the region
		var l=bounds.l,t=bounds.t,w=bounds.w,h=bounds.h;
		var points = [];
		map(range(0,w), function(i) {
			points[i] = perturbedPoint(l+i,t);
			points[w+h+i] = perturbedPoint(l+w-i,t+h);
		});
		map(range(0,h), function(i) {
			points[w+i] = perturbedPoint(l+w,t+i);
			points[w+h+w+i] = perturbedPoint(l,t+h-i);
		});
		var region = {i: index, p: points, d:[]};
		
		// mark it in the map
		for2d(bounds.l, bounds.t, bounds.l + bounds.w, bounds.t + bounds.h, function(x,y){
			regionMap[x][y] = region;
		});

		// return
		return region;
	}

    // Perturbs a point to give the region borders a natural feel.
	function perturbedPoint(x,y) {
		var angle = (sin(x*x*y*y*600+perturbConst*357)) * 6.28;
		var dist = (sin(x*y*600+perturbConst*211)) / 2;
		return [x+sin(angle)*dist, y+cos(angle)*dist];
	}

    // Figures out who borders with who, using the 2d grid in 'regionMap'.
	function fillNeighbourLists() {
		for2d(1, 1, mapWidth-1, mapHeight-1, function(x,y) {
			var region = regionMap[x][y];
			if (region) {
				if (!region.n) region.n = [];
				map([[-1,0],[1,0],[0,-1],[0,1]],function(d) {
					var potentialNeighbour = regionMap[x+d[0]][y+d[1]];
					if (potentialNeighbour && (potentialNeighbour != region) && (region.n.indexOf(potentialNeighbour) == -1))
						region.n.push(potentialNeighbour);
				});
			}
		});
	}
}

// ==========================================================
// This part of the code creates the initial rendering of the
// game map as an SVG object.
// ==========================================================

// Returns the center of weight of a given set of [x,y] points.
function centerOfWeight(points) {
	var xc = 0.0, yc = 0.0, l = points.length;
	map(points, function(p) {
		xc += p[0]; yc += p[1];
	});
	return [xc/l, yc/l];
}

// Affine transform of a sequence of points: [x*xm+xd,y*ym+yd]
function transformPoints(points, xm, ym, xd, yd) {
	var c = centerOfWeight(points);
	return map(points, function(p) {
		return [c[0] + (p[0]-c[0]) * xm + xd, c[1] + (p[1]-c[1]) * ym + yd];
	});
}

// 45-degree isometric projection for the map
function projectPoint(p) {
    var angle = Math.PI / 4;
    var isoX = (p[0] - p[1]) * Math.cos(angle);
    var isoY = (p[0] + p[1]) * Math.sin(angle);
    var scale = 2.0 * 100 / (Math.SQRT2 * (mapWidth + mapHeight));

    return [
        50 + (isoX - (mapWidth - mapHeight) * Math.cos(angle) / 2) * scale,
        50 + (isoY - (mapWidth + mapHeight) * Math.sin(angle) / 2) * scale
    ];
}

// Generate a SVG gradient stop tag.
function gradientStop(percent, color) {
	return elem('stop', {
		offset: percent + '%',
		s: 'stop-color:' + color
	});
}

// Generate a SVG gradient tag for the map.
function makeGradient(id, light, dark) {
	return elem('radialGradient', {
		i: id,
		cx: '-100%', cy: '50%',
		fx: '-100%', fy: '50%',
		r: '200%',
		gradientUnits: 'userSpaceOnUse' // we want it to scale with the map, not the region it's applied to
	}, gradientStop(60, dark) + gradientStop(100, light));
}

// Creates a new polygon with the given fill, stroke and clipping path.
function makePolygon(points, id, fill, stroke, clip) {
    stroke = stroke || "stroke:#000;stroke-width:0.25;";
    fill = fill ? "url(#" + fill + ")" : 'transparent';

    var properties = {
        i: id,
        points: map(points, projectPoint).join(' '),
        s: 'fill:' + fill + ";" + stroke + ';'
    };

    if (clip)
        properties['clip-path'] = clip

	return elem('polygon', properties);
}

// Takes the map (regions) stored in gameState.r, and creates an SVG map out of it.
function showMap(container, gameState) {
    var regions = gameState.r;

    // define gradients and clipping paths for rendering
    var defs = elem('defs', {},
            makeClipPaths() +
            makeGradient('b', '#88f', '#113') +
            makeGradient('l', '#fa6', '#530') +
            makeGradient('lh', '#fb7', '#741') +
            makeGradient('d', '#210', '#000') +
            makeGradient('w', '#55f', '#003') +
            map(gameState.p, function(player, index) {
                return makeGradient('p' + index, player.l, player.d) +
                    makeGradient('p' + index + 'h', player.h, player.hd);
            }).join(''));

    // create all the layers (5 per region)
    var ocean = makePolygon([[0,0],[mapWidth,0],[mapWidth,mapHeight],[0,mapHeight]], 'b', 'b');
    var tops = makeRegionPolys('r', 'l', 1, 1, 0, 0);
    var bottoms = makeRegionPolys('d', 'd', 1, 1, .05, .05);
    var shadows = makeRegionPolys('w', 'w', 1.05, 1.05, .2, .2, ' ');
    var highlighters = makeRegionPolys('hl', '', 1, 1, 0, 0, 'stroke:#fff;stroke-width:1.5;opacity:0.0;', 'clip');

    // replace the map container contents with the new map
    container.innerHTML = elem('svg', {
        viewBox: '0 0 100 100',
        preserveAspectRatio: 'none'
    }, defs + ocean + shadows + bottoms + tops + highlighters);

    // clean some internal structures used to track HTML nodes
    soldierDivsById = {};

    // hook up region objects to their HTML elements
    map(regions, function(region, index) {
        region.e = $('r' + index);
        region.c = projectPoint(centerOfWeight(region.p));

        region.hl = $('hl' + index);
        onClickOrTap(region.hl, invokeUICallback.bind(0, region, 'c'));
    });

    // additional callbacks for better UI
    onClickOrTap(doc.body, invokeUICallback.bind(0, null, 'c'));

    // make the temple <div>s
    makeTemples();


    // makes clipping paths for the "highlight" polygons
    function makeClipPaths() {
        return map(regions, function(region, index) {
            return elem('clipPath', {i: 'clip' + index}, makePolygon(region.p, 'cp' + index, 'l', ''));
        }).join('');
    }

    // a helper for creating a polygon with a given setup for all regions
    function makeRegionPolys(idPrefix, gradient, xm, ym, xd, yd, stroke, clip) {
        return elem('g', {}, map(regions, function(region, index) {
            return makePolygon(transformPoints(region.p, xm, ym, xd, yd), idPrefix + index, gradient, stroke, clip ? 'url(#' + clip + index + ')' : '');
        }).join(''));
    }

    // makes temple, which are just <div>s with nested <div>s (the towers)
    function makeTemples() {
        forEachProperty(gameState.t, function(temple) {

            var center = temple.r.c,
                style = 'left:' + (center[0]-1.5) + '%;top:' + (center[1]-4) + '%';

            // create the temple <div>s
            var templeHTML = div({
                c: 'temple',
                s: style
            }, div({c: 'temple-level'}, div({c: 'temple-level'}, div({c: 'temple-level'}, div({c: 'temple-level'})))));
            temple.e = append('m', templeHTML);

            // retrieve elements and bind callbacks
            onClickOrTap(temple.e, invokeUICallback.bind(0, temple.r, 't'));
        });
    }
}
