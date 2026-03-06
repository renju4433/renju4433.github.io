

// keep track of games by indices in the following list

games = []
comparison_cache = {}

silent = true;

function bare_le(g, h) {
    for(var i = 0; i < g.left.length; i++) {
	if(le(h,g.left[i]))
	    return false;
    }
    for(var i = 0; i < h.right.length; i++) {
	if(le(h.right[i],g))
	    return false;
    }
    return true;
}



function le(g,h) {
    if(g.index && h.index) {
	var d = 0;
	if(comparison_cache[g.index])
	    d = comparison_cache[g.index][h.index];
	if(d)
	    return d > 0;
	d = bare_le(g,h);
	if(!comparison_cache[g.index]) {
	    comparison_cache[g.index] = {};
	}
	comparison_cache[g.index][h.index] = d;
	return d;
    }
    return bare_le(g,h);
}

function eq(g, h) {
    return le(g,h) && le(h,g);
}

// take the indices as input, not the games,
// and return the index!
function get_game(lefts, rights) {
    ell = [];
    arr = [];
    for(var i = 0; i < lefts.length; i++) {
	ell.push(games[lefts[i]]);
    }
    for(var i = 0; i < rights.length; i++) {
	arr.push(games[rights[i]]);
    }
    g = {left: ell, right: arr};
    for(var i = 0; i < games.length; i++) {
	if(eq(g,games[i])) {
	    //console.log('duplicate game' + i);
	    //console.log(g);
	    return i;
	}
    }
    games.push(g);
    g.index = games.length - 1;
    //console.log(g.index + ", " + games[g.index].index);
    // canonicalize,
    // sigh, this is always a pain
    while(remove_reversibles(g)); // [sic]
    var retained = [];
    for(var i = 0; i < g.left.length; i++)
	retained[i] = true;
    for(var i = 0; i < g.left.length; i++) {
	for(var j = 0; j < g.left.length && retained[i]; j++) {
	    if(j == i || !retained[j])
		continue;
	    if(le(g.left[i],g.left[j])) {
		// ith option is dominated, so don't retain it
		retained[i] = false;
	    }
	}
    }
    var newleft = []
    for(var i = 0; i < g.left.length; i++) {
	if(retained[i]) {
	    newleft.push(g.left[i]);
	}
    }
    g.left = newleft;

    retained = [];
    for(var i = 0; i < g.right.length; i++)
	retained[i] = true;
    for(var i = 0; i < g.right.length; i++) {
	for(var j = 0; j < g.right.length && retained[j]; j++) {
	    if(j == i || !retained[j])
		continue;
	    if(le(g.right[j],g.right[i])) {
		retained[i] = false;
	    }
	}
    }
    var newright = []
    for(var i = 0; i < g.right.length; i++) {
	if(retained[i]) {
	    newright.push(g.right[i]);
	}
    }
    g.right = newright;
    

    return g.index;
}

function remove_reversibles(g) {
    for(var i = 0; i < g.left.length; i++) {
	gl = g.left[i];
	for(var j = 0; j < gl.right.length; j++) {
	    glr = gl.right[j];
	    if(le(glr,g)) {
		// TODO: do anything with lists in javascript
		for(var k = i+1; k < g.left.length; k++) {
		    g.left[k-1] = g.left[k];
		}
		g.left.pop()
		for(var k = 0; k < glr.left.length; k++) {
		    g.left.push(glr.left[k]);
		}
		return true;
	    }
	}
    }
    for(var i = 0; i < g.right.length; i++) {
	gr = g.right[i];
	for(var j = 0; j < gr.left.length; j++) {
	    grl = gr.left[j];
	    if(le(g,grl)) {
		for(var k = i+1; k < g.right.length; k++) {
		    g.right[k-1] = g.right[k];
		}
		g.right.pop()
		for(var k = 0; k < grl.right.length; k++) {
		    g.right.push(grl.right[k]);
		}
		return true;
	    }
	}
    }
    return false;
}




function neg(index) {
    var g = games[index];
    var ell = [];
    var arr = [];
    for(var i = 0; i < g.left.length; i++)
	arr.push(neg(g.left[i].index));
    for(var i = 0; i < g.right.length; i++)
	ell.push(neg(g.right[i].index));
    // console.log(ell);
    // console.log(arr);
    return get_game(ell,arr);
}

function plus(g,h) {
    // console.log("adding games " + g + " and " + h + " together.");
    g = games[g];
    h = games[h];
    //console.log(g);
    //console.log(h);
    var ell = [];
    var arr = [];
    for(var i = 0; i < g.left.length; i++) {
	//console.log("nbw that g.left[i].index is" + g.left[i].index);
	//console.log("and h.index is" + h.index);
	//console.log("coz h is ");
	//console.log(h);
	ell.push(plus(g.left[i].index,h.index));
    }
    for(var i = 0; i < h.left.length; i++)
	ell.push(plus(g.index,h.left[i].index));
    for(var i = 0; i < g.right.length; i++)
	arr.push(plus(g.right[i].index,h.index));
    for(var i = 0; i < h.right.length; i++)
	arr.push(plus(g.index,h.right[i].index));
    return get_game(ell,arr);
}



namesToValues = {};
valuesToNames = {};

function bind(name,value) {
    namesToValues[name] = value;
    valuesToNames[value] = name;
}




// takes the index of g
function display(g) {
    function dyadicCompare(a,b) {
        var e = Math.max(a.exp, b.exp);
        var an = a.num * Math.pow(2, e - a.exp);
        var bn = b.num * Math.pow(2, e - b.exp);
        if (an < bn) return -1;
        if (an > bn) return 1;
        return 0;
    }
    function ceilScaled(dy,k) {
        var delta = k - dy.exp;
        if (delta >= 0) return dy.num * Math.pow(2, delta);
        var div = Math.pow(2, -delta);
        return Math.ceil(dy.num / div);
    }
    function floorScaled(dy,k) {
        var delta = k - dy.exp;
        if (delta >= 0) return dy.num * Math.pow(2, delta);
        var div = Math.pow(2, -delta);
        return Math.floor(dy.num / div);
    }
    if(g in valuesToNames) {
	return valuesToNames[g];
    }
    var ng = neg(g);
    if(ng in valuesToNames) {
    	return "-" + valuesToNames[ng];
    }
    var dyadicCache = display.__dyadicCache || {};
    display.__dyadicCache = dyadicCache;
    function toDyadic(idx) {
        if (dyadicCache.hasOwnProperty(idx)) return dyadicCache[idx];
        var gobj = games[idx];
        var lefts = [];
        var rights = [];
        for (var i = 0; i < gobj.left.length; i++) {
            var d = toDyadic(gobj.left[i].index);
            if (d == null) { dyadicCache[idx] = null; return null; }
            lefts.push(d);
        }
        for (var j = 0; j < gobj.right.length; j++) {
            var d2 = toDyadic(gobj.right[j].index);
            if (d2 == null) { dyadicCache[idx] = null; return null; }
            rights.push(d2);
        }
        for (var a = 0; a < lefts.length; a++) {
            for (var b = 0; b < rights.length; b++) {
                if (!le(gobj.left[a], gobj.right[b])) { dyadicCache[idx] = null; return null; }
                if (le(gobj.right[b], gobj.left[a])) { dyadicCache[idx] = null; return null; }
            }
        }
        var lower = null;
        var upper = null;
        if (lefts.length > 0) {
            lower = lefts[0];
            for (var li = 1; li < lefts.length; li++) if (dyadicCompare(lefts[li], lower) > 0) lower = lefts[li];
        }
        if (rights.length > 0) {
            upper = rights[0];
            for (var ri = 1; ri < rights.length; ri++) if (dyadicCompare(rights[ri], upper) < 0) upper = rights[ri];
        }
        if (lower == null && upper == null) { var z = { num: 0, exp: 0 }; dyadicCache[idx] = z; return z; }
        if (upper == null) {
            var s = lower.num / Math.pow(2, lower.exp);
            var n = Math.floor(s) + 1;
            var r0 = { num: n, exp: 0 };
            dyadicCache[idx] = r0;
            return r0;
        }
        if (lower == null) {
            var s2 = upper.num / Math.pow(2, upper.exp);
            var n2 = Math.ceil(s2) - 1;
            var r1 = { num: n2, exp: 0 };
            dyadicCache[idx] = r1;
            return r1;
        }
        var k = 0;
        while (k < 60) {
            var L = ceilScaled(lower, k);
            var R = floorScaled(upper, k);
            if (L + 1 < R) {
                var m = L + 1;
                var r = { num: m, exp: k };
                dyadicCache[idx] = r;
                return r;
            }
            k++;
        }
        dyadicCache[idx] = null;
        return null;
    }
    var dy = toDyadic(g);
    if (dy) {
        return dyToString(dy);
    }
    g = games[g];
    var s = "{";
    if(g.left.length > 0) {
	for(var i = 0; i < g.left.length; i++) {
	    if(i > 0)
		s += ", ";
	    s += display(g.left[i].index);
	}
    }
    s += "|";
    if(g.right.length > 0) {
	for(var i = 0; i < g.right.length; i++) {
	    if(i > 0)
		s += ", ";
	    s += display(g.right[i].index);
	}
    }
    s += "}";
    return s;
}

function forceDisplay(g) {
    g = games[g];
    var s = "{";
    if(g.left.length > 0) {
	for(var i = 0; i < g.left.length; i++) {
	    if(i > 0)
		s += ", ";
	    s += display(g.left[i].index);
	}
    }
    s += "|";
    if(g.right.length > 0) {
	for(var i = 0; i < g.right.length; i++) {
	    if(i > 0)
		s += ", ";
	    s += display(g.right[i].index);
	}
    }
    s += "}";
    return s;
}

function dyCmp(a,b) {
    var e = Math.max(a.exp, b.exp);
    var an = a.num * Math.pow(2, e - a.exp);
    var bn = b.num * Math.pow(2, e - b.exp);
    if (an < bn) return -1;
    if (an > bn) return 1;
    return 0;
}
function dyNorm(a) {
    if (!a) return a;
    if (a.num === 0) return { num: 0, exp: 0 };
    var n = a.num;
    var e = a.exp;
    while (e > 0 && n % 2 === 0) {
        n = Math.floor(n / 2);
        e = e - 1;
    }
    return { num: n, exp: e };
}
function dyAdd(a,b) {
    var e = Math.max(a.exp, b.exp);
    var an = a.num * Math.pow(2, e - a.exp);
    var bn = b.num * Math.pow(2, e - b.exp);
    return dyNorm({ num: an + bn, exp: e });
}
function dySub(b,a) {
    var e = Math.max(a.exp, b.exp);
    var an = a.num * Math.pow(2, e - a.exp);
    var bn = b.num * Math.pow(2, e - b.exp);
    return dyNorm({ num: bn - an, exp: e });
}
function dyHalf(a) {
    return dyNorm({ num: a.num, exp: a.exp + 1 });
}
function dyToString(a) {
    if (!a) return "";
    a = dyNorm(a);
    if (a.num === 0) return "0";
    if (a.exp === 0) return String(a.num);
    var denom = Math.pow(2, a.exp);
    return String(a.num) + "/" + String(denom);
}
function dyadicOf(idx) {
    var cache = dyadicOf.__cache || {};
    dyadicOf.__cache = cache;
    if (cache.hasOwnProperty(idx)) return cache[idx];
    var gobj = games[idx];
    var lefts = [];
    var rights = [];
    for (var i = 0; i < gobj.left.length; i++) {
        var d = dyadicOf(gobj.left[i].index);
        if (d == null) { cache[idx] = null; return null; }
        lefts.push(d);
    }
    for (var j = 0; j < gobj.right.length; j++) {
        var d2 = dyadicOf(gobj.right[j].index);
        if (d2 == null) { cache[idx] = null; return null; }
        rights.push(d2);
    }
    for (var a = 0; a < lefts.length; a++) {
        for (var b = 0; b < rights.length; b++) {
            if (!le(gobj.left[a], gobj.right[b])) { cache[idx] = null; return null; }
            if (le(gobj.right[b], gobj.left[a])) { cache[idx] = null; return null; }
        }
    }
    var lower = null;
    var upper = null;
    if (lefts.length > 0) {
        lower = lefts[0];
        for (var li = 1; li < lefts.length; li++) if (dyCmp(lefts[li], lower) > 0) lower = lefts[li];
    }
    if (rights.length > 0) {
        upper = rights[0];
        for (var ri = 1; ri < rights.length; ri++) if (dyCmp(rights[ri], upper) < 0) upper = rights[ri];
    }
    if (lower == null && upper == null) { var z = { num: 0, exp: 0 }; cache[idx] = z; return z; }
    if (upper == null) {
        var s = lower.num / Math.pow(2, lower.exp);
        var n = Math.floor(s) + 1;
        var r0 = { num: n, exp: 0 };
        cache[idx] = r0;
        return r0;
    }
    if (lower == null) {
        var s2 = upper.num / Math.pow(2, upper.exp);
        var n2 = Math.ceil(s2) - 1;
        var r1 = { num: n2, exp: 0 };
        cache[idx] = r1;
        return r1;
    }
    var k = 0;
    while (k < 60) {
        var L = (k - lower.exp >= 0) ? lower.num * Math.pow(2, k - lower.exp) : Math.ceil(lower.num / Math.pow(2, lower.exp - k));
        var R = (k - upper.exp >= 0) ? upper.num * Math.pow(2, k - upper.exp) : Math.floor(upper.num / Math.pow(2, upper.exp - k));
        if (L + 1 < R) {
            var m = L + 1;
            var r = { num: m, exp: k };
            cache[idx] = r;
            return r;
        }
        k++;
    }
    cache[idx] = null;
    return null;
}
function gameMeanTemp(idx) {
    var cache = gameMeanTemp.__cache || {};
    gameMeanTemp.__cache = cache;
    if (cache.hasOwnProperty(idx)) return cache[idx];
    var gobj = games[idx];
    var lefts = [];
    var rights = [];
    for (var i = 0; i < gobj.left.length; i++) {
        var child = gobj.left[i].index;
        var mt = gameMeanTemp(child);
        var m = mt.mean;
        if (m == null) m = dyadicOf(child);
        if (m == null) { var r0 = { mean: null, temp: null }; cache[idx] = r0; return r0; }
        lefts.push(m);
    }
    for (var j = 0; j < gobj.right.length; j++) {
        var child2 = gobj.right[j].index;
        var mt2 = gameMeanTemp(child2);
        var m2 = mt2.mean;
        if (m2 == null) m2 = dyadicOf(child2);
        if (m2 == null) { var r1 = { mean: null, temp: null }; cache[idx] = r1; return r1; }
        rights.push(m2);
    }
    if (lefts.length === 0 && rights.length === 0) { var r2 = { mean: { num: 0, exp: 0 }, temp: { num: 0, exp: 0 } }; cache[idx] = r2; return r2; }
    var val = dyadicOf(idx);
    if (lefts.length === 0 || rights.length === 0) { var r3 = { mean: val, temp: { num: 0, exp: 0 } }; cache[idx] = r3; return r3; }
    var lower = lefts[0];
    for (var li = 1; li < lefts.length; li++) if (dyCmp(lefts[li], lower) > 0) lower = lefts[li];
    var upper = rights[0];
    for (var ri = 1; ri < rights.length; ri++) if (dyCmp(rights[ri], upper) < 0) upper = rights[ri];
    if (val && dyCmp(val, lower) >= 0 && dyCmp(val, upper) <= 0) { var r4 = { mean: val, temp: { num: 0, exp: 0 } }; cache[idx] = r4; return r4; }
    var diff = dySub(upper, lower);
    if (diff.num <= 0) { var r5 = { mean: dyHalf(dyAdd(lower, upper)), temp: { num: 0, exp: 0 } }; cache[idx] = r5; return r5; }
    var r6 = { mean: dyHalf(dyAdd(lower, upper)), temp: dyHalf(diff) };
    cache[idx] = r6;
    return r6;
}

// console.log(games[plus(up,up)]);
// console.log(display(plus(up,up)));
