// host.jsx — ExtendScript bridge between the CEP panel and Premiere Pro
// Defensive: every operation is wrapped in try/catch so a single bad call
// can never bring Premiere down.

var HOST_JSX_VERSION = "2.4";

function ccVersion() { return JSON.stringify({ ok: true, version: HOST_JSX_VERSION }); }

function _ccSafe(fn) {
    try { return fn(); } catch (e) { return null; }
}

function ccGetContext() {
    var ctx = { projectName: "", sequenceName: "", playheadSeconds: null, selectedClips: [] };
    try {
        if (typeof app === "undefined" || !app || !app.project) return JSON.stringify(ctx);

        ctx.projectName = _ccSafe(function () { return app.project.name || ""; }) || "";

        var seq = _ccSafe(function () { return app.project.activeSequence; });
        if (seq) {
            ctx.sequenceName = _ccSafe(function () { return seq.name || ""; }) || "";
            var pos = _ccSafe(function () {
                return (seq.getPlayerPosition && seq.getPlayerPosition()) || null;
            });
            if (pos && typeof pos.seconds === "number") ctx.playheadSeconds = pos.seconds;

            var sel = _ccSafe(function () { return seq.getSelection && seq.getSelection(); });
            if (sel && sel.length) {
                for (var i = 0; i < sel.length && i < 12; i++) {
                    var name = _ccSafe(function () { return sel[i].name || ""; });
                    if (name) ctx.selectedClips.push(name);
                }
            }
        }
    } catch (e) {
        ctx.error = String(e);
    }
    return JSON.stringify(ctx);
}

function _ccFindItemByPath(parent, path, depth) {
    if (!parent || depth > 6) return null;
    var children = _ccSafe(function () { return parent.children; });
    if (!children) return null;
    var n = _ccSafe(function () { return children.numItems; });
    if (typeof n !== "number" || n <= 0) return null;

    var basename = path && path.split ? path.split("/").pop() : "";

    for (var i = 0; i < n; i++) {
        var ch = _ccSafe(function () { return children[i]; });
        if (!ch) continue;

        // Recurse only if it really looks like a bin
        var t = _ccSafe(function () { return ch.type; });
        if (t === 2) {
            var found = _ccFindItemByPath(ch, path, depth + 1);
            if (found) return found;
            continue;
        }

        // Match by full media path or basename
        var mp = _ccSafe(function () { return ch.getMediaPath && ch.getMediaPath(); });
        if (mp) {
            if (mp === path) return ch;
            if (basename && mp.split("/").pop() === basename) return ch;
        }
    }
    return null;
}

function _ccTrackHasClipAt(track, seconds) {
    var has = false;
    try {
        var clips = track.clips;
        if (!clips) return false;
        var n = clips.numItems;
        if (typeof n !== "number") return false;
        for (var i = 0; i < n; i++) {
            var c = _ccSafe(function () { return clips[i]; });
            if (!c || !c.start || !c.end) continue;
            var s = c.start.seconds;
            var e = c.end.seconds;
            if (typeof s !== "number" || typeof e !== "number") continue;
            if (seconds + 0.0005 >= s && seconds + 0.0005 < e) { has = true; break; }
        }
    } catch (err) {}
    return has;
}

function ccImportToTimeline(path, mode) {
    var result = { ok: false, path: path, imported: false, placed: false };
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            result.error = "no project open";
            return JSON.stringify(result);
        }
        if (!path) { result.error = "no path"; return JSON.stringify(result); }
        mode = (mode === "insert" || mode === "overwrite" || mode === "overlay") ? mode : "overlay";

        // 1. Import
        var importedOk = _ccSafe(function () {
            return app.project.importFiles([path], true, app.project.rootItem, false);
        });
        if (!importedOk) { result.error = "import failed"; return JSON.stringify(result); }
        result.imported = true;

        // 2. Find the new item
        var item = _ccFindItemByPath(app.project.rootItem, path, 0);
        if (!item) {
            result.ok = true; // import worked, just couldn't find for placement
            result.reason = "imported to bin (item not located for placement)";
            return JSON.stringify(result);
        }

        // 3. Need a sequence
        var seq = _ccSafe(function () { return app.project.activeSequence; });
        if (!seq) {
            result.ok = true;
            result.reason = "imported to bin (no active sequence)";
            return JSON.stringify(result);
        }

        // 4. Playhead — only use seq.getPlayerPosition's Time, never construct new Time()
        var time = _ccSafe(function () { return seq.getPlayerPosition && seq.getPlayerPosition(); });
        if (!time || typeof time.seconds !== "number") {
            // Try sequence start as a fallback
            time = _ccSafe(function () { return seq.zeroPoint && (function () {
                var zp = {}; zp.seconds = 0; zp.ticks = seq.zeroPoint; return zp;
            })(); });
        }
        if (!time) {
            result.ok = true;
            result.reason = "imported to bin (could not resolve playhead)";
            return JSON.stringify(result);
        }
        var seconds = time.seconds;

        // 5. Pick track
        var vTracks = _ccSafe(function () { return seq.videoTracks; });
        if (!vTracks) {
            result.ok = true;
            result.reason = "imported to bin (no video tracks)";
            return JSON.stringify(result);
        }
        var nTracks = _ccSafe(function () { return vTracks.numTracks; });
        if (typeof nTracks !== "number" || nTracks <= 0) {
            result.ok = true;
            result.reason = "imported to bin (no video tracks)";
            return JSON.stringify(result);
        }

        var track = null;
        var trackIdx = 0;
        if (mode === "overlay") {
            var startIdx = nTracks > 1 ? 1 : 0;
            for (var i = startIdx; i < nTracks; i++) {
                var t = _ccSafe(function () { return vTracks[i]; });
                if (t && !_ccTrackHasClipAt(t, seconds)) { track = t; trackIdx = i; break; }
            }
            if (!track) {
                trackIdx = nTracks > 1 ? 1 : 0;
                track = _ccSafe(function () { return vTracks[trackIdx]; });
            }
        } else {
            track = _ccSafe(function () { return vTracks[0]; });
            trackIdx = 0;
        }
        if (!track) {
            result.ok = true;
            result.reason = "imported to bin (track unavailable)";
            return JSON.stringify(result);
        }

        // 6. Place — wrap the actual write so a bad call cannot crash PPro
        var placeOk = false;
        try {
            if (mode === "overwrite" && track.overwriteClip) {
                track.overwriteClip(item, time);
                placeOk = true;
            } else if (track.insertClip) {
                track.insertClip(item, time);
                placeOk = true;
            }
        } catch (placeErr) {
            result.ok = true; // still imported
            result.reason = "imported to bin (placement error: " + String(placeErr) + ")";
            return JSON.stringify(result);
        }

        if (!placeOk) {
            result.ok = true;
            result.reason = "imported to bin (placement method missing)";
            return JSON.stringify(result);
        }

        result.ok = true;
        result.placed = true;
        result.mode = mode;
        result.track = "V" + (trackIdx + 1);
        result.seconds = seconds;
        return JSON.stringify(result);
    } catch (e) {
        result.error = String(e);
        return JSON.stringify(result);
    }
}

function ccOpenInSource(path) {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ ok: false, error: "no project open" });
        }
        var item = _ccFindItemByPath(app.project.rootItem, path, 0);
        if (!item) {
            // Last-ditch attempt: import it first, then locate
            try { app.project.importFiles([path], true, app.project.rootItem, false); } catch (e) {}
            item = _ccFindItemByPath(app.project.rootItem, path, 0);
        }
        if (!item) return JSON.stringify({ ok: false, error: "file not in project" });

        if (app.sourceMonitor && app.sourceMonitor.openProjectItem) {
            app.sourceMonitor.openProjectItem(item);
            return JSON.stringify({ ok: true, path: path });
        }
        // Fallback: try openFilePath
        if (app.sourceMonitor && app.sourceMonitor.openFilePath) {
            var ok = app.sourceMonitor.openFilePath(path);
            return JSON.stringify({ ok: !!ok, path: path });
        }
        return JSON.stringify({ ok: false, error: "sourceMonitor API unavailable in this Premiere version" });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e), path: path });
    }
}

function ccImportFile(path) {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ ok: false, error: "no project open" });
        }
        var ok = _ccSafe(function () {
            return app.project.importFiles([path], true, app.project.rootItem, false);
        });
        return JSON.stringify({ ok: !!ok, path: path });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e), path: path });
    }
}

// Return info about the currently selected timeline clip — its source media
// path, duration, in/out points, and track. The panel needs the source path
// to ffmpeg the audio for silence detection.
function ccGetSelectedClip() {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ ok: false, error: "no project" });
        }
        var seq = _ccSafe(function () { return app.project.activeSequence; });
        if (!seq) return JSON.stringify({ ok: false, error: "no active sequence" });
        var found = null;
        var trackKind = null;
        var trackIdx = -1;

        // Walk video tracks first, then audio tracks, find first selected clip
        var checkTrack = function (track, kind, idx) {
            var clips = _ccSafe(function () { return track.clips; });
            if (!clips) return;
            for (var i = 0; i < clips.numItems; i++) {
                var c = _ccSafe(function () { return clips[i]; });
                if (c && c.isSelected && c.isSelected()) {
                    found = c; trackKind = kind; trackIdx = idx; return;
                }
            }
        };

        var vTracks = _ccSafe(function () { return seq.videoTracks; });
        if (vTracks) {
            for (var v = 0; v < vTracks.numTracks && !found; v++) {
                checkTrack(vTracks[v], "video", v);
            }
        }
        if (!found) {
            var aTracks = _ccSafe(function () { return seq.audioTracks; });
            if (aTracks) {
                for (var a = 0; a < aTracks.numTracks && !found; a++) {
                    checkTrack(aTracks[a], "audio", a);
                }
            }
        }
        if (!found) return JSON.stringify({ ok: false, error: "no clip selected" });

        var pi = _ccSafe(function () { return found.projectItem; });
        var path = "";
        if (pi) {
            path = _ccSafe(function () { return pi.getMediaPath && pi.getMediaPath(); }) || "";
        }

        var clipStart = _ccSafe(function () { return found.start && found.start.seconds; });
        var clipEnd   = _ccSafe(function () { return found.end && found.end.seconds; });
        var clipInPt  = _ccSafe(function () { return found.inPoint && found.inPoint.seconds; });
        var clipOutPt = _ccSafe(function () { return found.outPoint && found.outPoint.seconds; });
        var clipDur   = (typeof clipEnd === "number" && typeof clipStart === "number") ? (clipEnd - clipStart) : null;

        return JSON.stringify({
            ok: true,
            name: found.name || "",
            path: path,
            track: trackKind + (trackIdx + 1),
            trackKind: trackKind,
            trackIdx: trackIdx,
            timelineStart: clipStart,
            timelineEnd: clipEnd,
            inPoint: clipInPt,
            outPoint: clipOutPt,
            duration: clipDur,
        });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
    }
}

// Apply a list of cuts and TRUE ripple-delete the gaps (close them up).
// Strategy: set seq.inPoint + seq.outPoint per cut, then call QE's extract()
// which removes the in/out range across all tracks and slides everything
// after it leftward to close the gap. Cuts in reverse-time order so the
// timeline indices for earlier cuts don't drift.
function ccApplyAutoCuts(cutsJson) {
    var debug = { steps: [] };
    function note(s) { debug.steps.push(String(s)); }

    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ ok: false, error: "no project", debug: debug });
        }
        var seq = _ccSafe(function () { return app.project.activeSequence; });
        if (!seq) return JSON.stringify({ ok: false, error: "no active sequence", debug: debug });

        var cuts;
        try { cuts = JSON.parse(cutsJson); } catch (e) { return JSON.stringify({ ok: false, error: "bad cuts json", debug: debug }); }
        if (!cuts || !cuts.length) return JSON.stringify({ ok: false, error: "no cuts", debug: debug });

        // Resolve where the selected clip sits, so source-relative cut times
        // can be translated to timeline-relative seconds.
        var selRaw = ccGetSelectedClip();
        var sel = JSON.parse(selRaw);
        if (!sel.ok) return selRaw;
        note("sel: name=" + sel.name + " track=" + sel.track + " timelineStart=" + sel.timelineStart);

        var inPt = (typeof sel.inPoint === "number") ? sel.inPoint : 0;
        var timelineStart = (typeof sel.timelineStart === "number") ? sel.timelineStart : 0;

        // Enable QE — extract() lives there
        var qeSeq = null;
        try {
            if (typeof app.enableQE === "function") app.enableQE();
            if (typeof qe !== "undefined" && qe && qe.project) {
                qeSeq = qe.project.getActiveSequence ? qe.project.getActiveSequence() : null;
            }
        } catch (e) { note("enableQE error: " + e); }
        if (!qeSeq) return JSON.stringify({ ok: false, error: "QE unavailable", debug: debug });
        note("QE sequence loaded");

        // Save user's existing in/out so we can restore at the end
        var origIn = null, origOut = null;
        try { origIn = (seq.getInPoint && seq.getInPoint()) || null; } catch (e) {}
        try { origOut = (seq.getOutPoint && seq.getOutPoint()) || null; } catch (e) {}

        // Sort cuts ascending — apply chronologically, start → finish. Each
        // ripple-delete shifts everything after it leftward by its duration,
        // so we accumulate a running offset and subtract it from later cuts.
        cuts.sort(function (a, b) { return a.start - b.start; });

        var applied = 0, failed = 0;
        var shiftOffset = 0;
        for (var i = 0; i < cuts.length; i++) {
            var c = cuts[i];
            if (typeof c.start !== "number" || typeof c.end !== "number") { failed++; continue; }
            // Original timeline positions, then subtract the cumulative ripple
            // shift from all previously-applied cuts.
            var tStart = (timelineStart + (c.start - inPt)) - shiftOffset;
            var tEnd   = (timelineStart + (c.end   - inPt)) - shiftOffset;
            if (tEnd <= tStart) { failed++; continue; }
            note("cut[" + i + "] " + tStart.toFixed(3) + " → " + tEnd.toFixed(3) + " (" + (tEnd - tStart).toFixed(2) + "s)  shift=" + shiftOffset.toFixed(2));

            // Set sequence in/out — try several signatures because the API
            // varies (seconds vs Time vs Time-string vs ticks).
            var inOk = false, outOk = false;
            try { seq.setInPoint(tStart);  inOk  = true; } catch (e) { note("setInPoint(num) failed: " + e); }
            try { seq.setOutPoint(tEnd);   outOk = true; } catch (e) { note("setOutPoint(num) failed: " + e); }
            if (!inOk || !outOk) {
                // Try with Time objects
                try {
                    var inT = new Time(); inT.seconds = tStart;
                    var outT = new Time(); outT.seconds = tEnd;
                    if (!inOk  && seq.setInPointAsTime)  { seq.setInPointAsTime(inT);   inOk  = true; }
                    if (!outOk && seq.setOutPointAsTime) { seq.setOutPointAsTime(outT); outOk = true; }
                } catch (e2) { note("setIn/OutPointAsTime failed: " + e2); }
            }
            if (!inOk || !outOk) { failed++; note("could not set in/out points"); continue; }

            // Now extract — removes the in/out range across all tracks and ripples
            var extracted = false;
            try {
                if (qeSeq.extract) { qeSeq.extract(); extracted = true; note("  qeSeq.extract() ok"); }
            } catch (e3) { note("qeSeq.extract failed: " + e3); }
            if (!extracted) {
                // Fallback to seq.extract() if QE didn't have it
                try { if (seq.extract) { seq.extract(); extracted = true; note("  seq.extract() ok"); } }
                catch (e4) { note("seq.extract failed: " + e4); }
            }
            if (extracted) {
                applied++;
                shiftOffset += (tEnd - tStart);
            } else {
                failed++;
            }
        }

        // Restore original in/out so user's range isn't clobbered
        try {
            if (origIn && seq.setInPointAsTime) seq.setInPointAsTime(origIn);
            else if (origIn && typeof origIn === "number" && seq.setInPoint) seq.setInPoint(origIn);
        } catch (e) {}
        try {
            if (origOut && seq.setOutPointAsTime) seq.setOutPointAsTime(origOut);
            else if (origOut && typeof origOut === "number" && seq.setOutPoint) seq.setOutPoint(origOut);
        } catch (e) {}

        return JSON.stringify({ ok: true, applied: applied, failed: failed, debug: debug });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e), debug: debug });
    }
}

// Trigger Premiere's Edit > Undo N times. Tries several APIs in order
// because the right one varies across Premiere versions and OS.
function ccUndo(count) {
    var attempts = [];
    try {
        var n = parseInt(count, 10);
        if (!n || n < 1) n = 1;
        if (n > 200) n = 200; // safety cap
        if (typeof app === "undefined" || !app) {
            return JSON.stringify({ ok: false, error: "no app", attempts: attempts });
        }

        // Try each available undo path once to see what works on this system
        var undoFn = null;
        // (1) Direct menuFunctionId — most common
        if (typeof app.menuFunctionId === "function") {
            attempts.push("menuFunctionId");
            // Try a handful of known IDs across PPro releases
            var menuIds = [101, 16, 7, 0xA01];
            for (var mi = 0; mi < menuIds.length && !undoFn; mi++) {
                (function (id) {
                    var ok = _ccSafe(function () { app.menuFunctionId(id); return true; });
                    if (ok) undoFn = function () { app.menuFunctionId(id); };
                })(menuIds[mi]);
                if (undoFn) { attempts.push("menuFunctionId(" + menuIds[mi] + ")"); break; }
            }
        }
        // (2) executeCommand("Undo")
        if (!undoFn && typeof app.executeCommand === "function") {
            attempts.push("executeCommand");
            var ok2 = _ccSafe(function () { app.executeCommand("Undo"); return true; });
            if (ok2) undoFn = function () { app.executeCommand("Undo"); };
        }
        // (3) Send Cmd+Z to Premiere via osascript (macOS) / PowerShell (Win)
        if (!undoFn) {
            attempts.push("system-keystroke");
            var isMac = ($.os || "").toLowerCase().indexOf("mac") >= 0 || File.fs === "Macintosh";
            if (isMac) {
                undoFn = function () {
                    try {
                        var script = 'tell application "System Events" to keystroke "z" using command down';
                        var f = new File(Folder.temp + "/_pp_undo.sh");
                        f.open("w");
                        f.write('#!/bin/sh\nosascript -e \'' + script + '\'\n');
                        f.close();
                        f.execute();
                    } catch (e) {}
                };
            } else {
                undoFn = function () {
                    try {
                        var bat = new File(Folder.temp + "/_pp_undo.ps1");
                        bat.open("w");
                        bat.write('Add-Type -AssemblyName System.Windows.Forms\n[System.Windows.Forms.SendKeys]::SendWait("^z")\n');
                        bat.close();
                        bat.execute();
                    } catch (e) {}
                };
            }
        }

        if (!undoFn) {
            return JSON.stringify({ ok: false, error: "no undo path worked", attempts: attempts });
        }

        // Already consumed one undo from the path-probing call. Apply the rest.
        var done = 1;
        for (var i = 1; i < n; i++) {
            var ok3 = _ccSafe(function () { undoFn(); return true; });
            if (ok3) done++; else break;
        }
        return JSON.stringify({ ok: true, count: done, attempts: attempts });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e), attempts: attempts });
    }
}

// Toggle the panel's frame maximize state (same as Premiere's default backtick
// shortcut). CEP textareas eat backtick before Premiere sees it, so the panel
// JS forwards the keystroke through ExtendScript instead.
function ccMaximizeFrame() {
    try {
        if (typeof app === "undefined" || !app) {
            return JSON.stringify({ ok: false, error: "no app" });
        }
        // Premiere's menu function ID for "Maximize Frame" / "Restore Frame Size".
        // 4 has been the stable id across recent Premiere versions; 3520 is the
        // older legacy id. Try the modern one first.
        var commandIds = [4, 3520];
        for (var i = 0; i < commandIds.length; i++) {
            var done = _ccSafe(function () {
                if (typeof app.menuFunctionId !== "undefined" && app.menuFunctionId) {
                    app.menuFunctionId(commandIds[i]);
                    return true;
                }
                return false;
            });
            if (done) return JSON.stringify({ ok: true, via: "menuFunctionId:" + commandIds[i] });
        }
        // Fallback — execute by menu name
        var named = _ccSafe(function () {
            if (typeof app.executeCommand === "function") {
                app.executeCommand("Maximize Frame");
                return true;
            }
            return false;
        });
        if (named) return JSON.stringify({ ok: true, via: "executeCommand" });
        return JSON.stringify({ ok: false, error: "no fullscreen api in this Premiere version" });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
    }
}
