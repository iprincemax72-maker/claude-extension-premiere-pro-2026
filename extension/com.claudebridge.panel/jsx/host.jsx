// host.jsx — ExtendScript bridge between the CEP panel and Premiere Pro
// Defensive: every operation is wrapped in try/catch so a single bad call
// can never bring Premiere down.

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

// Apply a list of cuts to the currently selected timeline clip. Each cut is
// { start, end } in seconds relative to the SOURCE media (not the timeline).
// Strategy: razor at each cut boundary via QE (which is the only reliable
// razor API across PPro versions), then locate the freshly-split segment
// and ripple-delete it. Cuts run reverse-time so earlier indices don't shift.
function ccApplyAutoCuts(cutsJson) {
    var debug = { steps: [] };
    function note(s) { debug.steps.push(String(s)); }
    function pad2(n) { return n < 10 ? "0" + n : "" + n; }

    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ ok: false, error: "no project", debug: debug });
        }
        var seq = _ccSafe(function () { return app.project.activeSequence; });
        if (!seq) return JSON.stringify({ ok: false, error: "no active sequence", debug: debug });

        var cuts;
        try { cuts = JSON.parse(cutsJson); } catch (e) { return JSON.stringify({ ok: false, error: "bad cuts json", debug: debug }); }
        if (!cuts || !cuts.length) return JSON.stringify({ ok: false, error: "no cuts", debug: debug });

        // Re-find the selected clip (premiere may have re-indexed since last call)
        var selRaw = ccGetSelectedClip();
        var sel = JSON.parse(selRaw);
        if (!sel.ok) return selRaw;
        note("sel: name=" + sel.name + " track=" + sel.track + " start=" + sel.timelineStart);

        var inPt = (typeof sel.inPoint === "number") ? sel.inPoint : 0;
        var timelineStart = (typeof sel.timelineStart === "number") ? sel.timelineStart : 0;

        // Frame rate for timecode conversion. Premiere stores it in ticks/sec
        // where 1 second = 254016000000 ticks.
        var fps = 30;
        try {
            var settings = seq.getSettings && seq.getSettings();
            if (settings && settings.videoFrameRate && settings.videoFrameRate.ticks) {
                fps = 254016000000 / Number(settings.videoFrameRate.ticks);
            }
        } catch (e) { note("fps fallback: " + e); }
        if (!fps || fps < 1 || fps > 240) fps = 30;
        note("fps=" + fps.toFixed(3));

        function tc(sec) {
            // Build HH:MM:SS:FF — QE razor accepts this format on PPro 2018+.
            if (sec < 0) sec = 0;
            var totalFrames = Math.round(sec * fps);
            var ff = Math.floor(totalFrames % fps);
            var ss = Math.floor(totalFrames / fps) % 60;
            var mm = Math.floor(totalFrames / (fps * 60)) % 60;
            var hh = Math.floor(totalFrames / (fps * 3600));
            return pad2(hh) + ":" + pad2(mm) + ":" + pad2(ss) + ":" + pad2(ff);
        }

        // Enable QE so razor() is available
        var qeSeq = null;
        try {
            if (typeof app.enableQE === "function") app.enableQE();
            if (typeof qe !== "undefined" && qe && qe.project) {
                qeSeq = qe.project.getActiveSequence ? qe.project.getActiveSequence() : null;
            }
        } catch (e) { note("enableQE error: " + e); }
        if (!qeSeq) {
            return JSON.stringify({ ok: false, error: "QE unavailable — Premiere build doesn't expose qe.project.getActiveSequence", debug: debug });
        }
        note("QE sequence loaded");

        // Sort cuts descending so we operate on later cuts first
        cuts.sort(function (a, b) { return b.start - a.start; });

        var applied = 0, failed = 0;
        var trackList = (sel.trackKind === "audio") ? seq.audioTracks : seq.videoTracks;
        if (!trackList) return JSON.stringify({ ok: false, error: "no track list", debug: debug });

        for (var i = 0; i < cuts.length; i++) {
            var c = cuts[i];
            if (typeof c.start !== "number" || typeof c.end !== "number") { failed++; continue; }
            var tStart = timelineStart + (c.start - inPt);
            var tEnd   = timelineStart + (c.end   - inPt);
            note("cut[" + i + "] tStart=" + tStart.toFixed(3) + " tEnd=" + tEnd.toFixed(3) + " (" + tc(tStart) + " → " + tc(tEnd) + ")");

            var razored = false;
            try {
                // QE razor — second arg true would razor only selected, false = all
                qeSeq.razor(tc(tStart), false);
                qeSeq.razor(tc(tEnd), false);
                razored = true;
            } catch (e) {
                note("qe razor failed: " + e + " — trying per-track");
                // Per-track fallback: each QE track has its own razor
                try {
                    var qeTrack = (sel.trackKind === "audio")
                        ? qeSeq.getAudioTrackAt(sel.trackIdx)
                        : qeSeq.getVideoTrackAt(sel.trackIdx);
                    if (qeTrack && qeTrack.razor) {
                        qeTrack.razor(tc(tStart));
                        qeTrack.razor(tc(tEnd));
                        razored = true;
                    }
                } catch (e2) { note("per-track razor failed: " + e2); }
            }
            if (!razored) { failed++; continue; }

            // Find the newly-cut segment on the original track and remove it
            var track = trackList[sel.trackIdx];
            var clips = track && track.clips;
            if (!clips) { failed++; continue; }

            var deleted = false;
            for (var k = 0; k < clips.numItems; k++) {
                var cc = clips[k];
                var cs = _ccSafe(function () { return cc.start && cc.start.seconds; });
                var ce = _ccSafe(function () { return cc.end && cc.end.seconds; });
                if (typeof cs !== "number" || typeof ce !== "number") continue;
                if (cs >= tStart - 0.08 && ce <= tEnd + 0.08 && (ce - cs) > 0.05) {
                    try {
                        if (cc.remove) {
                            cc.remove(true, true); // ripple, alignToVideo
                            deleted = true;
                            break;
                        }
                    } catch (e3) { note("remove failed: " + e3); }
                }
            }
            if (deleted) applied++; else { failed++; note("cut[" + i + "] no segment found in range"); }
        }
        return JSON.stringify({ ok: true, applied: applied, failed: failed, debug: debug });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e), debug: debug });
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
