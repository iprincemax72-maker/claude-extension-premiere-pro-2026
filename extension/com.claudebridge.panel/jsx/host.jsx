// host.jsx — ExtendScript bridge between the CEP panel and Premiere Pro
// Defensive: every operation is wrapped in try/catch so a single bad call
// can never bring Premiere down.

var HOST_JSX_VERSION = "4.8";

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
        var pathSource = "none";
        if (pi) {
            // 1. Direct DOM method — works in most cases.
            path = _ccSafe(function () { return pi.getMediaPath && pi.getMediaPath(); }) || "";
            if (path) pathSource = "getMediaPath";

            // 2. Premiere column metadata. On some builds getMediaPath returns
            //    empty for nested sequences, multi-cam sources, subclips and a
            //    few MOV variants; the intrinsic media-path column still has
            //    the real path.
            if (!path) {
                path = _ccSafe(function () {
                    return pi.getColumnMetadata && pi.getColumnMetadata("Column.Intrinsic.MediaPath");
                }) || "";
                if (path) pathSource = "columnMetadata";
            }

            // 3. XMP metadata — Premiere stores a file path in xmpDM:filePath
            //    for some clips. Pull it out with a regex; only accept it if
            //    it looks like an actual filesystem path.
            if (!path) {
                path = _ccSafe(function () {
                    if (!pi.getXMPMetadata) return "";
                    var xmp = pi.getXMPMetadata();
                    if (!xmp) return "";
                    var patterns = [
                        /<xmpDM:filePath>([^<]+)<\/xmpDM:filePath>/i,
                        /<filePath[^>]*>([^<]+)<\/filePath>/i,
                    ];
                    for (var i = 0; i < patterns.length; i++) {
                        var m = xmp.match(patterns[i]);
                        if (m && m[1] && (m[1].indexOf("/") >= 0 || m[1].indexOf("\\") >= 0)) {
                            return m[1].replace(/^file:\/\//, "");
                        }
                    }
                    return "";
                }) || "";
                if (path) pathSource = "xmp";
            }

            // 4. QE walk — enable QE, find the QE item whose nodeId matches,
            //    read its filePath. Often works when DOM/metadata fail.
            if (!path) {
                path = _ccSafe(function () {
                    if (typeof app.enableQE === "function") app.enableQE();
                    if (typeof qe === "undefined" || !qe || !qe.project) return "";
                    var targetId = _ccSafe(function () { return pi.nodeId; });
                    if (!targetId) return "";
                    function walk(parent, depth) {
                        if (!parent || depth > 8) return "";
                        var n = _ccSafe(function () { return parent.numItems; });
                        if (typeof n !== "number") return "";
                        for (var i = 0; i < n; i++) {
                            var ch = _ccSafe(function () { return parent.getItemAt(i); });
                            if (!ch) continue;
                            var chId = _ccSafe(function () { return ch.nodeId; });
                            if (chId === targetId) {
                                var fp = _ccSafe(function () { return ch.filePath; });
                                if (fp) return fp;
                            }
                            var sub = walk(ch, depth + 1);
                            if (sub) return sub;
                        }
                        return "";
                    }
                    return walk(qe.project, 0) || "";
                }) || "";
                if (path) pathSource = "qe";
            }
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
            pathSource: pathSource,
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

        // Sequence FPS for frame-aligned snapping. ffmpeg gives us silences
        // in seconds, but Premiere works in frames — if the cut doesn't land
        // on a frame boundary, ripple-delete leaves a 1-frame sliver. We
        // floor the START to the nearest frame and ceil the END so each cut
        // covers at least the silence and no leftover frame remains.
        var fps = 30;
        try {
            var settings = seq.getSettings && seq.getSettings();
            if (settings && settings.videoFrameRate && settings.videoFrameRate.ticks) {
                fps = 254016000000 / Number(settings.videoFrameRate.ticks);
            }
        } catch (e) {}
        if (!fps || fps < 1 || fps > 240) fps = 30;
        var frameDur = 1 / fps;
        note("fps=" + fps.toFixed(3) + " frameDur=" + frameDur.toFixed(5));

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

        // Merge cuts that are close together. When several cuts land within a
        // second or two of each other, the bits of footage BETWEEN them
        // survive as tiny 0.3-1.5s orphan clips — the "sliver" field the user
        // keeps seeing. A fragment that short between two cuts is never a
        // coherent thought worth keeping; collapsing the cuts together
        // (cutting the island too) gives one clean cut instead of a row of
        // stutter-clips. 1.5s is long enough to preserve a real short
        // sentence but kills the orphan-fragment field.
        var MERGE_GAP_SEC = 1.5;
        var mergedCuts = [];
        for (var mi = 0; mi < cuts.length; mi++) {
            var mc = cuts[mi];
            if (typeof mc.start !== "number" || typeof mc.end !== "number" || mc.end <= mc.start) continue;
            if (mergedCuts.length) {
                var prevC = mergedCuts[mergedCuts.length - 1];
                if (mc.start <= prevC.end + MERGE_GAP_SEC) {
                    if (mc.end > prevC.end) prevC.end = mc.end;
                    continue;
                }
            }
            mergedCuts.push({ start: mc.start, end: mc.end });
        }
        note("merged " + cuts.length + " cuts -> " + mergedCuts.length + " (gap<" + MERGE_GAP_SEC + "s collapsed)");
        cuts = mergedCuts;

        // NEW CUT MECHANISM (host.jsx 4.8+): razor + razor + ripple-delete,
        // exactly the way a human editor describes it. Replaces the old
        // setInPoint/setOutPoint + qeSeq.extract() approach which had fuzzy
        // boundary semantics — extract() decides internally where to actually
        // cut, and the result was wrong frame + 1-frame slivers no matter how
        // we snapped the in/out points.
        //
        // Now per cut:
        //   1. Snap start and end to integer-frame boundaries (no half-frames,
        //      no +0.25 tricks).
        //   2. Razor every video and audio track at the start frame.
        //   3. Razor every video and audio track at the end frame.
        //   4. On each track, find the resulting track-item whose start lands
        //      on the start frame, and remove it with ripple-delete.
        //
        // Cuts are processed in REVERSE chronological order — applying the
        // last cut first means earlier cuts' timeline coordinates stay
        // valid (nothing before them has moved). That removes shift-tracking
        // entirely; no shiftOffset, no drift, no rounding bookkeeping.
        var TICKS_PER_SEC = 254016000000;
        function timeAtSec(sec) {
            // Premiere razor accepts either a ticks string or a Time object,
            // depending on version. Build both — caller tries whichever.
            return {
                ticks: String(Math.round(sec * TICKS_PER_SEC)),
                makeTime: function () {
                    try { var t = new Time(); t.seconds = sec; return t; } catch (e) { return null; }
                },
            };
        }

        function razorAllTracksAt(sec) {
            var t = timeAtSec(sec);
            function tryRazor(track) {
                if (!track || !track.razor) return false;
                // Try ticks-string, then Time object, then seconds-number.
                if (_ccSafe(function () { track.razor(t.ticks); return true; })) return true;
                var tm = t.makeTime();
                if (tm && _ccSafe(function () { track.razor(tm);    return true; })) return true;
                if (_ccSafe(function () { track.razor(sec);         return true; })) return true;
                return false;
            }
            var nv = _ccSafe(function () { return qeSeq.numVideoTracks; }) || 0;
            var na = _ccSafe(function () { return qeSeq.numAudioTracks; }) || 0;
            for (var i = 0; i < nv; i++) {
                var trk = _ccSafe(function () { return qeSeq.getVideoTrackAt(i); });
                if (trk) tryRazor(trk);
            }
            for (var i = 0; i < na; i++) {
                var trk = _ccSafe(function () { return qeSeq.getAudioTrackAt(i); });
                if (trk) tryRazor(trk);
            }
        }

        function rippleDeleteSegmentAt(startSec, endSec) {
            // After razoring at start + end, the segment between them is its
            // own track-item on each track. Find it (start ≈ startSec, end ≈
            // endSec) and remove with ripple. Frame-tolerance allows for tiny
            // float imprecision in Premiere's reported start/end.
            var tol = (1 / fps) * 0.4; // ~40% of a frame either way
            var anyRemoved = false;
            function processTrack(track) {
                if (!track) return;
                var n = _ccSafe(function () { return track.numItems; });
                if (typeof n !== "number" || n <= 0) return;
                for (var j = 0; j < n; j++) {
                    var item = _ccSafe(function () { return track.getItemAt(j); });
                    if (!item) continue;
                    var s = _ccSafe(function () { return item.start && item.start.seconds; });
                    var e = _ccSafe(function () { return item.end   && item.end.seconds;   });
                    if (typeof s !== "number" || typeof e !== "number") continue;
                    if (Math.abs(s - startSec) < tol && Math.abs(e - endSec) < tol) {
                        var ok = _ccSafe(function () { item.remove(true, false); return true; });
                        if (ok) anyRemoved = true;
                        return; // ripple shifted things — indices invalid past here
                    }
                }
            }
            var nv = _ccSafe(function () { return qeSeq.numVideoTracks; }) || 0;
            var na = _ccSafe(function () { return qeSeq.numAudioTracks; }) || 0;
            for (var i = 0; i < nv; i++) {
                var trk = _ccSafe(function () { return qeSeq.getVideoTrackAt(i); });
                processTrack(trk);
            }
            for (var i = 0; i < na; i++) {
                var trk = _ccSafe(function () { return qeSeq.getAudioTrackAt(i); });
                processTrack(trk);
            }
            return anyRemoved;
        }

        // Sort DESCENDING so we cut from the end of the timeline back to the
        // start — that way earlier cuts' positions are unaffected by ripples
        // from later cuts.
        cuts.sort(function (a, b) { return b.start - a.start; });

        var applied = 0, failed = 0;
        for (var i = 0; i < cuts.length; i++) {
            var c = cuts[i];
            if (typeof c.start !== "number" || typeof c.end !== "number") { failed++; continue; }
            // Timeline positions, frame-snapped (no fractional frames).
            var rawStart = timelineStart + (c.start - inPt);
            var rawEnd   = timelineStart + (c.end   - inPt);
            var startFrame = Math.round(rawStart * fps);
            var endFrame   = Math.round(rawEnd   * fps);
            if (startFrame < 0) startFrame = 0;
            if (endFrame <= startFrame) { failed++; note("cut[" + i + "] zero-length after snap, skip"); continue; }
            var startSec = startFrame / fps;
            var endSec   = endFrame   / fps;
            note("cut[" + i + "] frames " + startFrame + "→" + endFrame + " (" + ((endFrame - startFrame) / fps).toFixed(3) + "s)");

            // 1. Razor every track at start
            razorAllTracksAt(startSec);
            note("  razor @ " + startSec.toFixed(3));
            // 2. Razor every track at end
            razorAllTracksAt(endSec);
            note("  razor @ " + endSec.toFixed(3));
            // 3. Find the segment between the razors on each track and ripple-delete it
            var removed = rippleDeleteSegmentAt(startSec, endSec);
            if (removed) {
                applied++;
                note("  ripple-deleted ok");
            } else {
                failed++;
                note("  no matching track-item found between razors");
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

        // Dump the step log to a file so the actual frame numbers + measured
        // removals can be inspected after the fact.
        try {
            var _lf = new File("/Users/anshdhakad/PremiereClaude/output/autocut-apply-" + (new Date()).getTime() + ".log");
            _lf.open("w"); _lf.write(debug.steps.join("\n")); _lf.close();
        } catch (eLog) {}

        return JSON.stringify({ ok: true, applied: applied, failed: failed, debug: debug });
    } catch (e) {
        try {
            var _lf2 = new File("/Users/anshdhakad/PremiereClaude/output/autocut-apply-ERR-" + (new Date()).getTime() + ".log");
            _lf2.open("w"); _lf2.write(String(e) + "\n\n" + debug.steps.join("\n")); _lf2.close();
        } catch (eLog2) {}
        return JSON.stringify({ ok: false, error: String(e), debug: debug });
    }
}

// AUTO EDIT — receive a list of pre-rendered motion graphics, import each
// one, place it on V2/V3/V4 at the right time, with a brief fade in/out.
// Input JSON: { items: [{ file, atSec, type, label, durationSec }], baseTimelineSec? }
// `baseTimelineSec` is the timeline start of the selected clip (so atSec,
// which is in source-media time, can be translated into timeline time).
function ccAutoEditApply(payloadJson) {
    var debug = { steps: [] };
    function note(s) { debug.steps.push(String(s)); }

    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ ok: false, error: "no project", debug: debug });
        }
        var seq = _ccSafe(function () { return app.project.activeSequence; });
        if (!seq) return JSON.stringify({ ok: false, error: "no active sequence", debug: debug });

        var payload;
        try { payload = JSON.parse(payloadJson); } catch (e) { return JSON.stringify({ ok: false, error: "bad json", debug: debug }); }
        var items = payload && payload.items;
        if (!items || !items.length) return JSON.stringify({ ok: false, error: "no items", debug: debug });

        // Get FPS for frame snapping
        var fps = 30;
        try {
            var settings = seq.getSettings && seq.getSettings();
            if (settings && settings.videoFrameRate && settings.videoFrameRate.ticks) {
                fps = 254016000000 / Number(settings.videoFrameRate.ticks);
            }
        } catch (e) {}
        if (!fps || fps < 1 || fps > 240) fps = 30;

        // Selected-clip context: where on the timeline does this clip START,
        // and what is its inPoint into the source media? atSec from the bridge
        // is in source-media time (i.e. the seconds index of the speech inside
        // the underlying video file). To place on the timeline we need:
        //   timelineSec = sel.timelineStart + (atSec - sel.inPoint)
        var sel = JSON.parse(ccGetSelectedClip());
        var timelineStart = (sel && typeof sel.timelineStart === "number") ? sel.timelineStart : 0;
        var inPt          = (sel && typeof sel.inPoint       === "number") ? sel.inPoint       : 0;
        note("base timelineStart=" + timelineStart + " inPt=" + inPt + " fps=" + fps.toFixed(2));

        var vTracks = _ccSafe(function () { return seq.videoTracks; });
        if (!vTracks) return JSON.stringify({ ok: false, error: "no video tracks", debug: debug });
        var nTracks = _ccSafe(function () { return vTracks.numTracks; });
        if (!nTracks || nTracks < 2) {
            return JSON.stringify({ ok: false, error: "need at least 2 video tracks (V1 + V2)", debug: debug });
        }

        // Save the current playhead so we can restore it at the end.
        var origPlayhead = null;
        try { origPlayhead = seq.getPlayerPosition && seq.getPlayerPosition(); } catch (e) {}

        var applied = [];
        var skipped = [];

        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (!it || !it.file || typeof it.atSec !== "number") {
                skipped.push({ index: i, reason: "invalid item" });
                continue;
            }

            // 1. Import
            var importedOk = _ccSafe(function () {
                return app.project.importFiles([it.file], true, app.project.rootItem, false);
            });
            if (!importedOk) { skipped.push({ index: i, file: it.file, reason: "import failed" }); continue; }
            var item = _ccFindItemByPath(app.project.rootItem, it.file, 0);
            if (!item) { skipped.push({ index: i, file: it.file, reason: "item not found after import" }); continue; }

            // 2. Compute target timeline time (snap to frame).
            var rawSec = timelineStart + (it.atSec - inPt);
            var snappedSec = Math.floor(rawSec * fps) / fps;
            if (snappedSec < 0) snappedSec = 0;

            // 3. Pick the first overlay track (>= V2) with no clip at this time.
            var track = null, trackIdx = -1;
            for (var t = 1; t < nTracks; t++) {
                var trk = _ccSafe(function () { return vTracks[t]; });
                if (trk && !_ccTrackHasClipAt(trk, snappedSec)) { track = trk; trackIdx = t; break; }
            }
            // Fallback — if every overlay track is busy at this point, use V2.
            if (!track) { trackIdx = 1; track = _ccSafe(function () { return vTracks[1]; }); }
            if (!track) { skipped.push({ index: i, file: it.file, reason: "no overlay track" }); continue; }

            // 4. Move the playhead to the target time so insertClip(item, time)
            //    drops it there. ExtendScript exposes both setPlayerPosition
            //    (ticks-string) and Time(seconds) — try both.
            var TICKS_PER_SEC = 254016000000;
            var ticksStr = String(Math.floor(snappedSec * TICKS_PER_SEC));
            var moved = false;
            try { if (seq.setPlayerPosition) { seq.setPlayerPosition(ticksStr); moved = true; } } catch (e) {}
            // Read back the time as a Time-shaped object Premiere's API expects.
            var insertTime = null;
            try { insertTime = seq.getPlayerPosition && seq.getPlayerPosition(); } catch (e) {}
            if (!insertTime) {
                // Fallback: construct via Time()
                try { var tt = new Time(); tt.seconds = snappedSec; insertTime = tt; } catch (e) {}
            }
            if (!insertTime) { skipped.push({ index: i, file: it.file, reason: "could not build Time" }); continue; }

            // 5. Place. MUST use overwriteClip, not insertClip — insertClip
            //    ripple-inserts and shifts the timeline, which desyncs every
            //    graphic placed after it (and can shove the underlying video).
            //    overwriteClip drops the graphic onto the (empty) overlay
            //    track at the exact time, shifting nothing.
            var placed = false;
            try {
                if (track.overwriteClip) { track.overwriteClip(item, insertTime); placed = true; }
                else if (track.insertClip) { track.insertClip(item, insertTime); placed = true; }
            } catch (placeErr) {
                skipped.push({ index: i, file: it.file, reason: "place error: " + String(placeErr) });
                continue;
            }
            if (!placed) { skipped.push({ index: i, file: it.file, reason: "no overwriteClip method" }); continue; }

            applied.push({
                index: i, file: it.file,
                track: "V" + (trackIdx + 1),
                atSec: snappedSec,
                durationSec: it.durationSec || null,
                type: it.type || null,
            });
            note("placed[" + i + "] on V" + (trackIdx + 1) + " at " + snappedSec.toFixed(2) + "s");
        }

        // Restore the playhead.
        if (origPlayhead) {
            try { seq.setPlayerPosition && seq.setPlayerPosition(String(origPlayhead.ticks)); } catch (e) {}
        }

        return JSON.stringify({
            ok: true,
            applied: applied,
            skipped: skipped,
            debug: debug,
        });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e), debug: debug });
    }
}

// AUTO EDIT / AUTO CUT — try to pull a transcript out of Premiere's own
// Speech-to-Text rather than re-running whisper. Two paths to try:
//   (a) seq.captionTracks — populated when you click "Add captions to sequence"
//   (b) projectItem property "transcript" / metadata — older Premiere stored
//       transcripts on the source clip's project item
//
// Returns JSON: { ok, source: 'captions'|'projectItem'|'none', sentences: [...] }
// Each sentence is { startSec, endSec, text } in SOURCE-MEDIA time (not
// timeline time) so it's drop-in compatible with what whisper returns.
function ccGetSequenceCaptions() {
    var debug = { steps: [] };
    function note(s) { debug.steps.push(String(s)); }
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ ok: false, error: "no project", debug: debug });
        }
        var seq = _ccSafe(function () { return app.project.activeSequence; });
        if (!seq) return JSON.stringify({ ok: false, error: "no active sequence", debug: debug });

        // We need the selected clip's timeline-start + inPoint so we can
        // translate caption timeline-time → source-media time.
        var selRaw = ccGetSelectedClip();
        var sel = JSON.parse(selRaw);
        if (!sel.ok) return JSON.stringify({ ok: false, error: "no clip selected", debug: debug });

        var timelineStart = (typeof sel.timelineStart === "number") ? sel.timelineStart : 0;
        var timelineEnd   = (typeof sel.timelineEnd   === "number") ? sel.timelineEnd   : (timelineStart + 999999);
        var inPt          = (typeof sel.inPoint       === "number") ? sel.inPoint       : 0;
        note("clip timeline=[" + timelineStart.toFixed(2) + "," + timelineEnd.toFixed(2) + "] inPt=" + inPt.toFixed(2));

        var sentences = [];

        // ── Path A: captionTracks on the active sequence ─────────────────
        var capTracks = _ccSafe(function () { return seq.captionTracks; });
        var capCount = capTracks ? _ccSafe(function () { return capTracks.numTracks; }) || 0 : 0;
        note("caption tracks: " + capCount);

        if (capTracks && capCount > 0) {
            for (var t = 0; t < capCount; t++) {
                var track = _ccSafe(function () { return capTracks[t]; });
                if (!track) continue;
                var clips = _ccSafe(function () { return track.clips; });
                if (!clips) continue;
                var n = _ccSafe(function () { return clips.numItems; }) || 0;
                note("  track[" + t + "] clips: " + n);
                for (var i = 0; i < n; i++) {
                    var c = _ccSafe(function () { return clips[i]; });
                    if (!c) continue;
                    var cs = _ccSafe(function () { return c.start && c.start.seconds; });
                    var ce = _ccSafe(function () { return c.end   && c.end.seconds; });
                    if (typeof cs !== "number" || typeof ce !== "number") continue;
                    // Only keep captions inside this clip's timeline window
                    if (ce < timelineStart || cs > timelineEnd) continue;
                    // Caption text — API name varies by Premiere version
                    var text = "";
                    try { text = c.getCaption && c.getCaption(); } catch (e1) {}
                    if (!text) { try { text = c.captionString; } catch (e2) {} }
                    if (!text) { try { text = c.name; } catch (e3) {} }
                    if (!text || typeof text !== "string") continue;
                    text = text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
                    if (!text) continue;
                    sentences.push({
                        startSec: (cs - timelineStart) + inPt,
                        endSec:   (ce - timelineStart) + inPt,
                        text: text,
                    });
                }
            }
        }

        if (sentences.length > 0) {
            note("returned " + sentences.length + " sentences from captionTracks");
            return JSON.stringify({ ok: true, source: 'captions', sentences: sentences, debug: debug });
        }

        // ── Path B: projectItem-level transcript metadata ────────────────
        // Some Premiere versions stash the transcribe-only data on the source
        // project item as a property or XMP. Try a few accessors.
        var pi = null;
        try {
            // Find project item by path
            var path = sel.path;
            if (path) pi = _ccFindItemByPath(app.project.rootItem, path, 0);
        } catch (e) {}

        if (pi) {
            // Try common property names
            var candidates = ["transcript", "transcribedSpeech", "getSpeechTranscription"];
            for (var k = 0; k < candidates.length; k++) {
                try {
                    var fn = pi[candidates[k]];
                    if (typeof fn === "function") {
                        var v = fn.call(pi);
                        note("pi." + candidates[k] + "() returned " + (typeof v));
                    } else if (typeof fn === "string" && fn.length) {
                        note("pi." + candidates[k] + " = string length " + fn.length);
                    }
                } catch (e) {}
            }
        }

        return JSON.stringify({ ok: true, source: 'none', sentences: [], debug: debug });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e), debug: debug });
    }
}

// Diagnostic — dump everything we can see about the active sequence's text/
// captions setup. Used once to discover what's actually accessible on this
// Premiere version. Result goes to the panel's log so we can read it.
function ccProbeTranscript() {
    var out = { ok: true, paths: {} };
    try {
        out.paths.appType = typeof app;
        if (typeof app === "undefined" || !app || !app.project) return JSON.stringify({ ok: false, error: "no project" });
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ ok: false, error: "no active sequence" });
        out.paths.seqName = seq.name;

        // Enumerate seq's enumerable properties (best-effort — ExtendScript
        // doesn't always expose them via for-in, but try)
        var seqProps = [];
        for (var k in seq) { try { seqProps.push(k + ": " + (typeof seq[k])); } catch(e) {} }
        out.paths.seqProps = seqProps;

        // Caption tracks
        var ct = _ccSafe(function () { return seq.captionTracks; });
        out.paths.hasCaptionTracks = !!ct;
        if (ct) {
            out.paths.numCaptionTracks = _ccSafe(function () { return ct.numTracks; }) || 0;
            if (out.paths.numCaptionTracks > 0) {
                var t0 = _ccSafe(function () { return ct[0]; });
                if (t0) {
                    var c0 = _ccSafe(function () { return t0.clips; });
                    out.paths.track0_clipsCount = c0 ? (_ccSafe(function () { return c0.numItems; }) || 0) : 0;
                    if (c0 && out.paths.track0_clipsCount > 0) {
                        var ci0 = _ccSafe(function () { return c0[0]; });
                        if (ci0) {
                            var ciProps = [];
                            for (var k2 in ci0) { try { ciProps.push(k2 + ": " + (typeof ci0[k2])); } catch(e) {} }
                            out.paths.firstCaptionProps = ciProps;
                            out.paths.firstCaptionStart = _ccSafe(function () { return ci0.start && ci0.start.seconds; });
                            out.paths.firstCaptionEnd   = _ccSafe(function () { return ci0.end   && ci0.end.seconds; });
                            out.paths.firstCaptionTextViaGetCaption = _ccSafe(function () { return ci0.getCaption && ci0.getCaption(); });
                            out.paths.firstCaptionTextViaString     = _ccSafe(function () { return ci0.captionString; });
                            out.paths.firstCaptionTextViaName       = _ccSafe(function () { return ci0.name; });
                        }
                    }
                }
            }
        }

        // Sequence-level transcript? (long shot)
        out.paths.seqTranscript = _ccSafe(function () { return typeof seq.transcript; });

        return JSON.stringify(out);
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e), partial: out });
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

        // ONLY in-process undo: app.executeCommand("Undo"). It's a named
        // command so a wrong call is a no-op, not a misfire.
        //
        // The old code did two dangerous things, both removed:
        //  - probed app.menuFunctionId by *firing* a list of guessed IDs.
        //    menuFunctionId doesn't throw on a bad ID, it just runs whatever
        //    menu command that ID maps to — so probing fired random commands.
        //  - wrote a .sh script and called File.execute() on it. execute()
        //    OPENS a file in its default handler app (here: Antigravity),
        //    it does not run it — so the keystroke never reached Premiere.
        // The reliable cross-app fallback (osascript) now lives in the Node
        // bridge's /undo endpoint, which the panel calls if this returns
        // ok:false.
        if (typeof app.executeCommand !== "function") {
            return JSON.stringify({ ok: false, error: "executeCommand unavailable", attempts: attempts });
        }
        // VERIFY undo actually happened. executeCommand can exist but be a
        // no-op for "Undo" — without a check we'd report success when nothing
        // changed. Each ripple-delete shortened the sequence, so a real Undo
        // lengthens it again: measure seq duration before/after.
        var seq = _ccSafe(function () { return app.project.activeSequence; });
        function durTicks() {
            try { return (seq && seq.end != null) ? Number(seq.end) : null; } catch (e) { return null; }
        }
        var before = durTicks();
        attempts.push("executeCommand");
        var done = 0;
        for (var i = 0; i < n; i++) {
            var ok = _ccSafe(function () { app.executeCommand("Undo"); return true; });
            if (ok) done++; else break;
        }
        var after = durTicks();
        // If the timeline didn't change at all, executeCommand("Undo") is a
        // no-op on this build — report failure so the panel falls back to the
        // bridge's osascript undo.
        if (before != null && after != null && before === after) {
            return JSON.stringify({ ok: false, error: "executeCommand(Undo) had no effect on the timeline", attempts: attempts });
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
