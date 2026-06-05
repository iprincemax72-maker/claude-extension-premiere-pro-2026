// host.jsx — ExtendScript bridge between the CEP panel and Premiere Pro
// Defensive: every operation is wrapped in try/catch so a single bad call
// can never bring Premiere down.

var HOST_JSX_VERSION = "5.4";

function ccVersion() { return JSON.stringify({ ok: true, version: HOST_JSX_VERSION }); }

function _ccSafe(fn) {
    try { return fn(); } catch (e) { return null; }
}

function ccGetContext() {
    var ctx = { projectName: "", projectPath: "", sequenceName: "", playheadSeconds: null, selectedClips: [] };
    try {
        if (typeof app === "undefined" || !app || !app.project) return JSON.stringify(ctx);

        ctx.projectName = _ccSafe(function () { return app.project.name || ""; }) || "";
        // Project file path (e.g. "/Users/…/Vera Vid 13/Vera Vid 13.pproj").
        // Used by the bridge to render outputs INTO the project folder so
        // renders are colocated with the project for easy cleanup. Empty if
        // the project hasn't been saved to disk yet.
        ctx.projectPath = _ccSafe(function () { return app.project.path || ""; }) || "";

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

// Active-sequence frame dimensions + fps. Used by Captions so the rendered
// overlay matches the sequence aspect/resolution exactly. Falls back to a
// vertical 1080x1920 @30 default if nothing can be read.
function ccGetSeqDims() {
    var out = { ok: false, width: 1080, height: 1920, fps: 30 };
    try {
        if (typeof app === "undefined" || !app || !app.project) return JSON.stringify(out);
        var seq = _ccSafe(function () { return app.project.activeSequence; });
        if (!seq) return JSON.stringify(out);
        var w = _ccSafe(function () { return seq.frameSizeHorizontal; });
        var h = _ccSafe(function () { return seq.frameSizeVertical; });
        if (!(typeof w === "number" && w > 0)) {
            var s = _ccSafe(function () { return seq.getSettings && seq.getSettings(); });
            if (s) {
                w = _ccSafe(function () { return Number(s.videoFrameWidth); });
                h = _ccSafe(function () { return Number(s.videoFrameHeight); });
            }
        }
        if (typeof w === "number" && w > 0) out.width = Math.round(w);
        if (typeof h === "number" && h > 0) out.height = Math.round(h);
        var settings = _ccSafe(function () { return seq.getSettings && seq.getSettings(); });
        if (settings && settings.videoFrameRate && settings.videoFrameRate.ticks) {
            var fps = 254016000000 / Number(settings.videoFrameRate.ticks);
            if (isFinite(fps) && fps > 0) out.fps = Math.round(fps * 1000) / 1000;
        }
        out.ok = true;
    } catch (e) {
        out.error = String(e);
    }
    return JSON.stringify(out);
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

function ccImportToTimeline(path, mode, atSec) {
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

        // 2b. Tag the imported project item with the Rose color label so
        // the user can tell AI-generated clips apart from their own
        // editing. Index 6 == Rose in Premiere's default label palette.
        // Wrapped in _ccSafe — if a Premiere build exposes a different
        // method name, just skip silently rather than crash the import.
        _ccSafe(function () {
            if (typeof item.setColorLabel === "function") {
                item.setColorLabel(6);
            } else if (typeof item.colorLabel !== "undefined") {
                item.colorLabel = 6;
            }
        });

        // 3. Need a sequence
        var seq = _ccSafe(function () { return app.project.activeSequence; });
        if (!seq) {
            result.ok = true;
            result.reason = "imported to bin (no active sequence)";
            return JSON.stringify(result);
        }

        // 4. Placement time. If atSec is given (captions sync to the clip's
        //    timeline position), move the playhead there and read the Time back
        //    (never construct new Time()). Otherwise use the current playhead.
        var atSecNum = null;
        if (typeof atSec === "number" && atSec >= 0) atSecNum = atSec;
        else if (atSec !== null && atSec !== undefined && atSec !== "") {
            var _p = parseFloat(atSec); if (!isNaN(_p) && _p >= 0) atSecNum = _p;
        }
        if (atSecNum !== null) {
            var _ticks = String(Math.round(atSecNum * 254016000000));
            _ccSafe(function () { if (seq.setPlayerPosition) seq.setPlayerPosition(_ticks); });
        }
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
            // For a timed placement (atSec, e.g. captions) prefer overwriteClip —
            // it drops the clip at the exact time on the empty overlay track
            // without rippling later clips (which insertClip can do).
            if (atSecNum !== null && track.overwriteClip) {
                track.overwriteClip(item, time);
                placeOk = true;
            } else if (mode === "overwrite" && track.overwriteClip) {
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

// Import a LIST of caption clips and place each as its own element on the
// timeline (every caption is a separate, movable layer — not one baked file).
// clipsJson = [{ path, timelineSec }]. Each is overwriteClip'd at its time on an
// overlay track above the base video.
// Best-effort: ensure the active sequence has at least 'want' video tracks, so
// captions can live up high (away from footage + each other). QE is the only reliable
// way to add tracks in ExtendScript; the addTracks signature varies by Premiere build,
// so we try a few. Returns the resulting track count (may be < want if QE is blocked).
function _ccEnsureVideoTracks(seq, want) {
    var vt = _ccSafe(function () { return seq.videoTracks; });
    var n = vt ? _ccSafe(function () { return vt.numTracks; }) : 0;
    if (typeof n !== "number") n = 0;
    if (n >= want) return n;
    var toAdd = want - n;
    _ccSafe(function () { if (typeof app.enableQE === "function") app.enableQE(); });
    var qs = _ccSafe(function () {
        return (typeof qe !== "undefined" && qe && qe.project && qe.project.getActiveSequence) ? qe.project.getActiveSequence() : null;
    });
    if (qs) {
        var added = _ccSafe(function () { qs.addTracks(toAdd, n, 0, 0, 0); return true; });
        if (!added) added = _ccSafe(function () { qs.addTracks(toAdd, n, 0); return true; });
        if (!added) added = _ccSafe(function () { qs.addTracks(toAdd, n); return true; });
        if (!added) added = _ccSafe(function () { qs.addTracks(toAdd); return true; });
    }
    vt = _ccSafe(function () { return seq.videoTracks; });
    n = vt ? _ccSafe(function () { return vt.numTracks; }) : n;
    return (typeof n === "number") ? n : 0;
}

function ccImportCaptionClips(clipsJson) {
    var result = { ok: false, placed: 0, total: 0, errors: [] };
    try {
        if (typeof app === "undefined" || !app || !app.project) { result.error = "no project open"; return JSON.stringify(result); }
        var clips;
        try { clips = JSON.parse(clipsJson); } catch (e0) { result.error = "bad clips json"; return JSON.stringify(result); }
        if (!clips || !clips.length) { result.error = "no clips"; return JSON.stringify(result); }
        result.total = clips.length;

        var seq = _ccSafe(function () { return app.project.activeSequence; });
        if (!seq) { result.error = "no active sequence"; return JSON.stringify(result); }
        // Put captions up HIGH (≈ V19–V22) so they never collide with the footage or
        // each other. Best-effort grow the sequence to 22 video tracks; if QE can't add
        // them, we degrade to the top tracks that DO exist.
        _ccEnsureVideoTracks(seq, 22);
        var vTracks = _ccSafe(function () { return seq.videoTracks; });
        var nTracks = vTracks ? _ccSafe(function () { return vTracks.numTracks; }) : 0;
        if (typeof nTracks !== "number" || nTracks <= 0) { result.error = "no video tracks"; return JSON.stringify(result); }
        var overlayBase = nTracks > 1 ? 1 : 0;   // first track above the base video
        // caption band = the top 4 video tracks (V19–V22 when 22 exist)
        var bandTop = nTracks - 1;
        var bandBottom = bandTop - 3;
        if (bandBottom < overlayBase) bandBottom = overlayBase;
        result.band = "V" + (bandBottom + 1) + "-V" + (bandTop + 1);

        for (var i = 0; i < clips.length; i++) {
            var clip = clips[i];
            var p = clip && clip.path;
            if (!p) { result.errors.push("clip " + i + ": no path"); continue; }

            var ok = _ccSafe(function () { return app.project.importFiles([p], true, app.project.rootItem, false); });
            var item = _ccFindItemByPath(app.project.rootItem, p, 0);
            if (!item) { result.errors.push("clip " + i + ": item not found"); continue; }
            _ccSafe(function () { if (typeof item.setColorLabel === "function") item.setColorLabel(6); });

            // move playhead to the clip's time, read the Time back (never new Time())
            var atSec = Number(clip.timelineSec) || 0;
            var ticks = String(Math.round(atSec * 254016000000));
            _ccSafe(function () { if (seq.setPlayerPosition) seq.setPlayerPosition(ticks); });
            var time = _ccSafe(function () { return seq.getPlayerPosition && seq.getPlayerPosition(); });
            if (!time) { result.errors.push("clip " + i + ": no time"); continue; }

            // pick the first track in the high caption band that's free at this time
            // (so overlapping captions spread across V19–V22 instead of colliding)
            var track = null;
            for (var t = bandBottom; t <= bandTop; t++) {
                var tk = _ccSafe((function (idx) { return function () { return vTracks[idx]; }; })(t));
                if (tk && !_ccTrackHasClipAt(tk, atSec)) { track = tk; break; }
            }
            if (!track) track = _ccSafe((function (idx) { return function () { return vTracks[idx]; }; })(bandBottom));
            if (!track) { result.errors.push("clip " + i + ": no track"); continue; }

            var placed = false;
            try {
                if (track.overwriteClip) { track.overwriteClip(item, time); placed = true; }
                else if (track.insertClip) { track.insertClip(item, time); placed = true; }
            } catch (e2) { result.errors.push("clip " + i + ": " + String(e2)); }
            if (placed) result.placed++;
        }
        result.ok = true;
        return JSON.stringify(result);
    } catch (e) {
        result.error = String(e);
        return JSON.stringify(result);
    }
}

// NATIVE editable captions: import an SRT and try to add it as a real Premiere
// caption track (fully editable text + position in Premiere). If the caption-track
// API isn't available on this build, the SRT still lands in the bin and the user
// drags it onto the timeline (Premiere turns it into an editable caption track).
function ccImportCaptions(srtPath) {
    var result = { ok: false, imported: false, placed: false, path: srtPath };
    try {
        if (typeof app === "undefined" || !app || !app.project) { result.error = "no project open"; return JSON.stringify(result); }
        if (!srtPath) { result.error = "no path"; return JSON.stringify(result); }
        var importedOk = _ccSafe(function () { return app.project.importFiles([srtPath], true, app.project.rootItem, false); });
        if (!importedOk) { result.error = "import failed"; return JSON.stringify(result); }
        result.imported = true;
        var item = _ccFindItemByPath(app.project.rootItem, srtPath, 0);
        if (!item) { result.ok = true; result.reason = "imported to bin (drag it onto the timeline to make a caption track)"; return JSON.stringify(result); }
        var seq = _ccSafe(function () { return app.project.activeSequence; });
        if (!seq) { result.ok = true; result.reason = "imported to bin (no active sequence)"; return JSON.stringify(result); }

        var placed = false;
        _ccSafe(function () {
            if (typeof seq.createCaptionTrack === "function") {
                // arg/format forms vary across Premiere builds — try the likely ones
                try { seq.createCaptionTrack(item, 0, seq.zeroPoint); placed = true; }
                catch (e1) {
                    try { seq.createCaptionTrack(item, 0); placed = true; }
                    catch (e2) {
                        try { seq.createCaptionTrack(item); placed = true; } catch (e3) {}
                    }
                }
            }
        });
        result.ok = true;
        result.placed = placed;
        result.reason = placed
            ? "added as an editable caption track"
            : "imported to bin — drag it onto the timeline to create an editable caption track";
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

// ── AUTO-EDIT v2 selection ────────────────────────────────────────────────
// Resolve a projectItem's underlying media-file path using the same 4-method
// cascade ccGetSelectedClip uses. Returns "" when there is no single file
// (e.g. a nested sequence — handled separately by _ccFindNestedSequence).
function _ccResolveMediaPath(pi) {
    if (!pi) return "";
    var path = _ccSafe(function () { return pi.getMediaPath && pi.getMediaPath(); }) || "";
    if (path) return path;
    path = _ccSafe(function () { return pi.getColumnMetadata && pi.getColumnMetadata("Column.Intrinsic.MediaPath"); }) || "";
    if (path) return path;
    path = _ccSafe(function () {
        if (!pi.getXMPMetadata) return "";
        var xmp = pi.getXMPMetadata();
        if (!xmp) return "";
        var patterns = [/<xmpDM:filePath>([^<]+)<\/xmpDM:filePath>/i, /<filePath[^>]*>([^<]+)<\/filePath>/i];
        for (var i = 0; i < patterns.length; i++) {
            var m = xmp.match(patterns[i]);
            if (m && m[1] && (m[1].indexOf("/") >= 0 || m[1].indexOf("\\") >= 0)) return m[1].replace(/^file:\/\//, "");
        }
        return "";
    }) || "";
    if (path) return path;
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
    return path;
}

// A clip whose projectItem has no media file but IS a sequence = a nested
// sequence. Find the matching Sequence object so we can walk its real media.
function _ccFindNestedSequence(pi) {
    if (!pi) return null;
    var piId = _ccSafe(function () { return pi.nodeId; });
    var piName = _ccSafe(function () { return pi.name; });
    var seqs = _ccSafe(function () { return app.project.sequences; });
    if (!seqs) return null;
    var n = _ccSafe(function () { return seqs.numSequences; });
    if (typeof n !== "number") n = _ccSafe(function () { return seqs.length; });
    if (typeof n !== "number") return null;
    var byName = null;
    for (var i = 0; i < n; i++) {
        var s = _ccSafe(function () { return seqs[i]; });
        if (!s) continue;
        var sPi = _ccSafe(function () { return s.projectItem; });
        var sId = sPi && _ccSafe(function () { return sPi.nodeId; });
        if (sId && piId && sId === piId) return s;
        var sName = _ccSafe(function () { return s.name; });
        if (sName && piName && sName === piName) byName = s;
    }
    return byName; // name match is the fallback when nodeIds don't line up
}

// Walk a nested sequence's tracks and return audio segments that fall inside
// the [outerIn, outerOut] portion the outer clip actually uses, each mapped to
// where it lands on the OUTER timeline. Prefers audio tracks (clean speech);
// falls back to video tracks (embedded audio) when there are no audio clips.
function _ccNestedAudioSegments(nseq, outerTimelineStart, outerIn, outerOut) {
    var segs = [];
    function collect(tracks) {
        if (!tracks) return;
        var nt = _ccSafe(function () { return tracks.numTracks; });
        if (typeof nt !== "number") return;
        for (var t = 0; t < nt; t++) {
            var trk = _ccSafe(function () { return tracks[t]; });
            var clips = trk && _ccSafe(function () { return trk.clips; });
            if (!clips) continue;
            var nc = _ccSafe(function () { return clips.numItems; });
            for (var c = 0; c < nc; c++) {
                var cl = _ccSafe(function () { return clips[c]; });
                if (!cl) continue;
                var cpi = _ccSafe(function () { return cl.projectItem; });
                var p = _ccResolveMediaPath(cpi);
                if (!p) continue;
                var nStart = _ccSafe(function () { return cl.start && cl.start.seconds; });
                var nEnd   = _ccSafe(function () { return cl.end && cl.end.seconds; });
                var srcIn  = _ccSafe(function () { return cl.inPoint && cl.inPoint.seconds; });
                if (typeof nStart !== "number" || typeof nEnd !== "number") continue;
                var lo = Math.max(nStart, outerIn);
                var hi = Math.min(nEnd, outerOut);
                if (hi - lo < 0.05) continue;            // outside the used portion
                var srcLo = (typeof srcIn === "number" ? srcIn : 0) + (lo - nStart);
                var srcHi = srcLo + (hi - lo);
                var tl = outerTimelineStart + (lo - outerIn);
                segs.push({ path: p, inSec: srcLo, outSec: srcHi, timelineStart: tl });
            }
        }
    }
    collect(_ccSafe(function () { return nseq.audioTracks; }));
    if (!segs.length) collect(_ccSafe(function () { return nseq.videoTracks; }));
    return segs;
}

// Return EVERY selected clip (across all tracks), resolved down to a flat list
// of audio segments in timeline order — supports multi-clip selection (a whole
// cut-up video) AND nested sequences. Linked A/V duplicates are de-duped.
function ccGetSelectedClips() {
    try {
        if (typeof app === "undefined" || !app || !app.project) return JSON.stringify({ ok: false, error: "no project" });
        var seq = _ccSafe(function () { return app.project.activeSequence; });
        if (!seq) return JSON.stringify({ ok: false, error: "no active sequence" });

        var sel = [];
        function scan(tracks, kind) {
            if (!tracks) return;
            var nt = _ccSafe(function () { return tracks.numTracks; });
            if (typeof nt !== "number") return;
            for (var t = 0; t < nt; t++) {
                var trk = _ccSafe(function () { return tracks[t]; });
                var clips = trk && _ccSafe(function () { return trk.clips; });
                if (!clips) continue;
                var nc = _ccSafe(function () { return clips.numItems; });
                for (var i = 0; i < nc; i++) {
                    var c = _ccSafe(function () { return clips[i]; });
                    if (c && c.isSelected && c.isSelected()) sel.push({ clip: c, kind: kind, trackIdx: t });
                }
            }
        }
        scan(_ccSafe(function () { return seq.videoTracks; }), "video");
        scan(_ccSafe(function () { return seq.audioTracks; }), "audio");
        if (!sel.length) return JSON.stringify({ ok: false, error: "no clip selected" });

        var clips = [], allSegs = [], spanLo = Infinity, spanHi = -Infinity;
        for (var k = 0; k < sel.length; k++) {
            var found = sel[k].clip;
            var pi = _ccSafe(function () { return found.projectItem; });
            var name = _ccSafe(function () { return found.name; }) || "";
            var tlStart = _ccSafe(function () { return found.start && found.start.seconds; });
            var tlEnd   = _ccSafe(function () { return found.end && found.end.seconds; });
            var inPt    = _ccSafe(function () { return found.inPoint && found.inPoint.seconds; });
            var outPt   = _ccSafe(function () { return found.outPoint && found.outPoint.seconds; });
            if (typeof tlStart !== "number") continue;
            var dur = (typeof tlEnd === "number") ? (tlEnd - tlStart) : null;
            var inV = (typeof inPt === "number") ? inPt : 0;
            var outV = (typeof outPt === "number") ? outPt : (inV + (dur || 0));

            var path = _ccResolveMediaPath(pi);
            var nested = false, segs = [];
            if (path) {
                // timelineDur (tlEnd-tlStart) vs source span (outV-inV): they
                // differ when the clip has a speed change, so the bridge can
                // scale source-seconds → timeline-seconds. 1x clips: equal.
                segs = [{ path: path, inSec: inV, outSec: outV, timelineStart: tlStart,
                          timelineDur: (typeof dur === "number" && dur > 0) ? dur : (outV - inV) }];
            } else {
                var nseq = _ccFindNestedSequence(pi);
                if (nseq) { nested = true; segs = _ccNestedAudioSegments(nseq, tlStart, inV, outV); }
            }
            if (!segs.length) continue;
            for (var s = 0; s < segs.length; s++) allSegs.push(segs[s]);
            if (tlStart < spanLo) spanLo = tlStart;
            if (typeof tlEnd === "number" && tlEnd > spanHi) spanHi = tlEnd;
            clips.push({ name: name, nested: nested, kind: sel[k].kind, timelineStart: tlStart, timelineEnd: tlEnd, inPoint: inV, outPoint: outV, segmentCount: segs.length });
        }
        if (!allSegs.length) return JSON.stringify({ ok: false, error: "Couldn't resolve media for the selected clip(s). If it's a nested sequence, make sure it contains audio." });

        // De-dupe linked A/V (video clip + its linked audio share file/time).
        allSegs.sort(function (a, b) { return a.timelineStart - b.timelineStart; });
        var seen = {}, deduped = [];
        for (var d = 0; d < allSegs.length; d++) {
            var g = allSegs[d];
            var key = g.path + "|" + Math.round(g.timelineStart * 10) + "|" + Math.round(g.inSec * 10);
            if (seen[key]) continue;
            seen[key] = 1; deduped.push(g);
        }
        return JSON.stringify({
            ok: true, count: clips.length, clips: clips, segments: deduped,
            span: { start: spanLo, end: spanHi }, durationSec: (spanHi - spanLo),
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

        // Razor + ripple-delete — exactly the "two cuts then delete the piece"
        // mechanism. extract() has too many ambiguous boundary issues; we go
        // razor-first and only fall through to extract() if EVERY razor
        // attempt (multiple time formats, multiple APIs) genuinely produces
        // no edit on the timeline.
        //
        // The previous razor attempt in 4.8 looked like it failed because we
        // trusted "didn't throw" = "worked". It doesn't — razor can silently
        // no-op on a wrong time format. Here we VERIFY by counting track
        // items before/after each attempt. If the count went up, it worked.
        var TICKS_PER_SEC = 254016000000;

        function seqDurTicks() {
            try { if (seq.end != null) return Number(seq.end); } catch (e) {}
            return null;
        }

        function totalItemCount() {
            var n = 0;
            var nv = _ccSafe(function () { return qeSeq.numVideoTracks; }) || 0;
            var na = _ccSafe(function () { return qeSeq.numAudioTracks; }) || 0;
            for (var i = 0; i < nv; i++) {
                var t = _ccSafe(function () { return qeSeq.getVideoTrackAt(i); });
                if (t) n += _ccSafe(function () { return t.numItems; }) || 0;
            }
            for (var i = 0; i < na; i++) {
                var t = _ccSafe(function () { return qeSeq.getAudioTrackAt(i); });
                if (t) n += _ccSafe(function () { return t.numItems; }) || 0;
            }
            return n;
        }

        function secondsToTimecode(sec) {
            var f = Math.round(fps);
            var totalFrames = Math.round(sec * fps);
            var ff = totalFrames % f;
            var totalSecs = Math.floor(totalFrames / f);
            var ss = totalSecs % 60;
            var mm = Math.floor(totalSecs / 60) % 60;
            var hh = Math.floor(totalSecs / 3600);
            function p(n) { return n < 10 ? "0" + n : "" + n; }
            return p(hh) + ":" + p(mm) + ":" + p(ss) + ":" + p(ff);
        }

        // Verified add-edit at a given time. Tries (in order): qeSeq.addEdit
        // after moving the playhead, qeTrack.razor with TICKS, then with
        // TIMECODE, then with seconds, then with a Time object. After EACH
        // attempt, checks whether the track-item count actually increased.
        // Returns the label of the method that worked, or false if nothing
        // does. Caches the working method per call so subsequent cuts skip
        // the trial-and-error and just use what we already proved works.
        var _razorMethodCache = null;
        function addEditAtTime(sec) {
            var before = totalItemCount();
            var ticks = String(Math.round(sec * TICKS_PER_SEC));
            var tc = secondsToTimecode(sec);
            var tObj = null;
            try { tObj = new Time(); tObj.seconds = sec; } catch (e) {}

            function tryMethod(label, fn) {
                _ccSafe(fn);
                var after = totalItemCount();
                if (after > before) {
                    note("    razor[" + label + "] worked (items " + before + " → " + after + ")");
                    return true;
                }
                return false;
            }

            // If a previous cut figured out which method works, use that.
            if (_razorMethodCache) {
                if (_razorMethodCache(ticks, tc, tObj, sec)) {
                    var after = totalItemCount();
                    if (after > before) return true;
                }
            }

            // Try qeSeq.addEdit via playhead — splits ALL tracks at once.
            if (tryMethod("addEdit", function () {
                if (seq.setPlayerPosition) seq.setPlayerPosition(ticks);
                if (qeSeq.addEdit) qeSeq.addEdit();
            })) {
                _razorMethodCache = function (tk) {
                    if (seq.setPlayerPosition) seq.setPlayerPosition(tk);
                    if (qeSeq.addEdit) qeSeq.addEdit();
                };
                return true;
            }

            // Per-track razor — try each time format on EACH track in turn.
            var nv = _ccSafe(function () { return qeSeq.numVideoTracks; }) || 0;
            var na = _ccSafe(function () { return qeSeq.numAudioTracks; }) || 0;

            function razorAllWith(arg) {
                for (var i = 0; i < nv; i++) {
                    var t = _ccSafe(function () { return qeSeq.getVideoTrackAt(i); });
                    if (t && typeof t.razor === "function") _ccSafe(function () { t.razor(arg); });
                }
                for (var i = 0; i < na; i++) {
                    var t = _ccSafe(function () { return qeSeq.getAudioTrackAt(i); });
                    if (t && typeof t.razor === "function") _ccSafe(function () { t.razor(arg); });
                }
            }

            if (tryMethod("razor(ticks)",    function () { razorAllWith(ticks); })) {
                _razorMethodCache = function (tk) { razorAllWith(tk); };
                return true;
            }
            if (tryMethod("razor(tc)",       function () { razorAllWith(tc);    })) {
                _razorMethodCache = function (tk, tcArg) { razorAllWith(tcArg); };
                return true;
            }
            if (tryMethod("razor(seconds)",  function () { razorAllWith(sec);   })) {
                _razorMethodCache = function (tk, tcArg, tmArg, secArg) { razorAllWith(secArg); };
                return true;
            }
            if (tObj && tryMethod("razor(Time)", function () { razorAllWith(tObj); })) {
                _razorMethodCache = function (tk, tcArg, tmArg) { razorAllWith(tmArg); };
                return true;
            }

            note("    razor: NO method increased item count");
            return false;
        }

        function rippleDeleteSegmentAt(startSec, endSec) {
            var tol = (1 / fps) * 0.7;
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
                        return;
                    }
                }
            }
            var nv = _ccSafe(function () { return qeSeq.numVideoTracks; }) || 0;
            var na = _ccSafe(function () { return qeSeq.numAudioTracks; }) || 0;
            for (var i = 0; i < nv; i++) processTrack(_ccSafe(function () { return qeSeq.getVideoTrackAt(i); }));
            for (var i = 0; i < na; i++) processTrack(_ccSafe(function () { return qeSeq.getAudioTrackAt(i); }));
            return anyRemoved;
        }

        // Diagnostic — dump the timeline state at the start of the run.
        // Helps identify if the apparent "wrong place" cuts are actually
        // wrong, or if our reported timeline coords don't match Premiere's.
        (function dumpTimeline() {
            var nv = _ccSafe(function () { return qeSeq.numVideoTracks; }) || 0;
            var na = _ccSafe(function () { return qeSeq.numAudioTracks; }) || 0;
            note("timeline state: " + nv + " video tracks, " + na + " audio tracks");
            for (var i = 0; i < Math.min(nv, 2); i++) {
                var trk = _ccSafe(function () { return qeSeq.getVideoTrackAt(i); });
                if (!trk) continue;
                var n = _ccSafe(function () { return trk.numItems; }) || 0;
                note("  V" + (i + 1) + ": " + n + " items");
                for (var j = 0; j < Math.min(n, 5); j++) {
                    var it = _ccSafe(function () { return trk.getItemAt(j); });
                    if (!it) continue;
                    var s = _ccSafe(function () { return it.start && it.start.seconds; });
                    var e = _ccSafe(function () { return it.end   && it.end.seconds;   });
                    if (typeof s === "number" && typeof e === "number") {
                        note("    item[" + j + "] timeline " + s.toFixed(3) + "→" + e.toFixed(3));
                    }
                }
            }
            for (var i = 0; i < Math.min(na, 2); i++) {
                var trk = _ccSafe(function () { return qeSeq.getAudioTrackAt(i); });
                if (!trk) continue;
                var n = _ccSafe(function () { return trk.numItems; }) || 0;
                note("  A" + (i + 1) + ": " + n + " items");
            }
        })();

        // First try razor on cut 0 to determine if razor actually works on
        // this Premiere build. If yes → razor for all cuts (descending order,
        // no shift bookkeeping). If no → fall through to extract().
        cuts.sort(function (a, b) { return b.start - a.start; }); // descending for razor
        var applied = 0, failed = 0;
        var razorProven = null; // null = untested, true/false after probe

        for (var i = 0; i < cuts.length; i++) {
            var c = cuts[i];
            if (typeof c.start !== "number" || typeof c.end !== "number") { failed++; continue; }
            var rawStart = timelineStart + (c.start - inPt);
            var rawEnd   = timelineStart + (c.end   - inPt);
            var startFrame = Math.round(rawStart * fps);
            var endFrame   = Math.round(rawEnd   * fps);
            if (startFrame < 0) startFrame = 0;
            if (endFrame <= startFrame) { failed++; continue; }
            var startSec = startFrame / fps;
            var endSec   = endFrame   / fps;
            note("cut[" + i + "] src " + c.start.toFixed(3) + "→" + c.end.toFixed(3)
                + "  tl " + rawStart.toFixed(3) + "→" + rawEnd.toFixed(3)
                + "  frames " + startFrame + "→" + endFrame
                + " (" + ((endFrame - startFrame) / fps).toFixed(3) + "s)");

            // Razor at start
            var razored1 = addEditAtTime(startSec);
            // If the very first razor attempt produced nothing, razor is
            // unusable on this build — stop trying and break to extract path.
            if (razorProven === null) {
                razorProven = razored1;
                if (!razorProven) {
                    note("  razor unproven on first attempt — switching to extract() for all cuts");
                    break;
                }
            }
            if (!razored1) { failed++; note("  razor @ start failed"); continue; }
            // Razor at end
            if (!addEditAtTime(endSec)) { failed++; note("  razor @ end failed"); continue; }
            // Remove the segment now between the two edits
            if (rippleDeleteSegmentAt(startSec, endSec)) {
                applied++;
                note("  removed via razor+ripple");
            } else {
                failed++;
                note("  razor edits made but no matching segment found to remove");
            }
        }

        // Fallback: razor was proven unusable → use extract() for all cuts.
        if (razorProven === false) {
            cuts.sort(function (a, b) { return a.start - b.start; }); // ascending for extract
            var shiftOffset = 0;
            applied = 0; failed = 0;
            for (var i = 0; i < cuts.length; i++) {
                var c = cuts[i];
                if (typeof c.start !== "number" || typeof c.end !== "number") { failed++; continue; }
                var rawStart = (timelineStart + (c.start - inPt)) - shiftOffset;
                var rawEnd   = (timelineStart + (c.end   - inPt)) - shiftOffset;
                var startFrame = Math.floor(rawStart * fps);
                var endFrame   = Math.ceil(rawEnd   * fps) + 1;
                if (startFrame < 0) startFrame = 0;
                if (endFrame <= startFrame) { failed++; continue; }
                var tStart = (startFrame + 0.25) / fps;
                var tEnd   = (endFrame   + 0.25) / fps;
                var cutDur = (endFrame - startFrame) / fps;
                note("[extract] cut[" + i + "] frames " + startFrame + "→" + endFrame + " (" + cutDur.toFixed(3) + "s) shift=" + shiftOffset.toFixed(3));
                var inOk = _ccSafe(function () { seq.setInPoint(tStart);  return true; });
                var outOk = _ccSafe(function () { seq.setOutPoint(tEnd); return true; });
                if ((!inOk || !outOk) && typeof Time !== "undefined") {
                    try {
                        var inT = new Time(); inT.seconds = tStart;
                        var outT = new Time(); outT.seconds = tEnd;
                        if (!inOk  && seq.setInPointAsTime)  { seq.setInPointAsTime(inT);   inOk  = true; }
                        if (!outOk && seq.setOutPointAsTime) { seq.setOutPointAsTime(outT); outOk = true; }
                    } catch (e2) {}
                }
                if (!inOk || !outOk) { failed++; continue; }
                var durBefore = seqDurTicks();
                var ok = _ccSafe(function () { qeSeq.extract(); return true; });
                if (!ok) ok = _ccSafe(function () { seq.extract(); return true; });
                if (ok) {
                    var durAfter = seqDurTicks();
                    if (durBefore != null && durAfter != null && durBefore > durAfter) {
                        shiftOffset += (durBefore - durAfter) / TICKS_PER_SEC;
                    } else {
                        shiftOffset += cutDur;
                    }
                    applied++;
                    note("  extract ok, shift " + shiftOffset.toFixed(3));
                } else {
                    failed++;
                }
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
            // v2 items place by absolute timelineSec; legacy ones by atSec.
            // Accept either so a timelineSec-only item isn't dropped here before
            // the placement math below gets to use it.
            if (!it || !it.file || (typeof it.atSec !== "number" && typeof it.timelineSec !== "number")) {
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

            // 2. Compute target timeline time (snap to frame). Auto-Edit v2
            //    sends timelineSec already in timeline time (multi-clip /
            //    nested); legacy single-clip sends source-media atSec which we
            //    offset by where the selected clip sits.
            var rawSec = (typeof it.timelineSec === "number")
                ? it.timelineSec
                : (timelineStart + (it.atSec - inPt));
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
// Auto-Cut orchestrated cut primitives — used by the panel's new applyAutoCuts
// which drives Premiere's NATIVE "Add Edit" command (via osascript on the
// bridge) for the actual razor, instead of trying to coax QE's broken razor.
// The panel calls these between bridge /addedit hits.

// Position the playhead at an EXACT frame boundary. Returns the snapped
// seconds value so the caller can use the same number for the razor + remove.
function ccSetPlayhead(timeSec) {
    try {
        if (typeof app === "undefined" || !app || !app.project) return JSON.stringify({ ok: false, error: "no project" });
        var seq = _ccSafe(function () { return app.project.activeSequence; });
        if (!seq) return JSON.stringify({ ok: false, error: "no active sequence" });

        var fps = 30;
        try {
            var settings = seq.getSettings && seq.getSettings();
            if (settings && settings.videoFrameRate && settings.videoFrameRate.ticks) {
                fps = 254016000000 / Number(settings.videoFrameRate.ticks);
            }
        } catch (e) {}
        if (!fps || fps < 1 || fps > 240) fps = 30;

        // Snap to exact integer frame, then compute ticks at that frame boundary
        // using the sequence's own ticksPerFrame so we land EXACTLY on a frame.
        var frame = Math.round(Number(timeSec) * fps);
        if (frame < 0) frame = 0;
        var ticksPerFrame = 254016000000 / fps;
        try {
            var setSettings = seq.getSettings && seq.getSettings();
            if (setSettings && setSettings.videoFrameRate && setSettings.videoFrameRate.ticks) {
                ticksPerFrame = Number(setSettings.videoFrameRate.ticks);
            }
        } catch (e) {}
        var ticks = Math.round(frame * ticksPerFrame);
        var ticksStr = String(ticks);

        var ok = _ccSafe(function () { seq.setPlayerPosition(ticksStr); return true; });
        if (!ok) return JSON.stringify({ ok: false, error: "setPlayerPosition failed" });
        return JSON.stringify({ ok: true, frame: frame, seconds: frame / fps, ticks: ticksStr });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
    }
}

// After the panel has razored at startSec and endSec via osascript Add Edit,
// find the resulting track-item on each track and remove it with ripple.
// Frame-aligned matching with a generous tolerance.
function ccRippleDeleteAt(startSec, endSec) {
    var debug = { steps: [] };
    function note(s) { debug.steps.push(String(s)); }
    try {
        if (typeof app === "undefined" || !app || !app.project) return JSON.stringify({ ok: false, error: "no project", debug: debug });
        var seq = _ccSafe(function () { return app.project.activeSequence; });
        if (!seq) return JSON.stringify({ ok: false, error: "no active sequence", debug: debug });

        var fps = 30;
        try {
            var settings = seq.getSettings && seq.getSettings();
            if (settings && settings.videoFrameRate && settings.videoFrameRate.ticks) {
                fps = 254016000000 / Number(settings.videoFrameRate.ticks);
            }
        } catch (e) {}
        if (!fps || fps < 1 || fps > 240) fps = 30;

        if (typeof app.enableQE === "function") app.enableQE();
        var qeSeq = (typeof qe !== "undefined" && qe && qe.project && qe.project.getActiveSequence)
            ? qe.project.getActiveSequence() : null;
        if (!qeSeq) return JSON.stringify({ ok: false, error: "QE unavailable", debug: debug });

        var startSnap = Math.round(Number(startSec) * fps) / fps;
        var endSnap   = Math.round(Number(endSec)   * fps) / fps;
        var tol = (1 / fps) * 0.7;
        note("ripple " + startSnap.toFixed(3) + "→" + endSnap.toFixed(3) + " tol=" + tol.toFixed(4));

        var anyRemoved = false;
        function processTrack(track, label) {
            if (!track) return;
            var n = _ccSafe(function () { return track.numItems; });
            if (typeof n !== "number" || n <= 0) return;
            for (var j = 0; j < n; j++) {
                var item = _ccSafe(function () { return track.getItemAt(j); });
                if (!item) continue;
                var s = _ccSafe(function () { return item.start && item.start.seconds; });
                var e = _ccSafe(function () { return item.end   && item.end.seconds;   });
                if (typeof s !== "number" || typeof e !== "number") continue;
                if (Math.abs(s - startSnap) < tol && Math.abs(e - endSnap) < tol) {
                    var ok = _ccSafe(function () { item.remove(true, false); return true; });
                    if (ok) {
                        note("  removed " + label + " item " + s.toFixed(3) + "→" + e.toFixed(3));
                        anyRemoved = true;
                    } else {
                        note("  " + label + " item matched but remove() refused");
                    }
                    return;
                }
            }
            note("  no " + label + " item matched at this range");
        }

        var nv = _ccSafe(function () { return qeSeq.numVideoTracks; }) || 0;
        var na = _ccSafe(function () { return qeSeq.numAudioTracks; }) || 0;
        for (var i = 0; i < nv; i++) {
            processTrack(_ccSafe(function () { return qeSeq.getVideoTrackAt(i); }), "V" + (i + 1));
        }
        for (var i = 0; i < na; i++) {
            processTrack(_ccSafe(function () { return qeSeq.getAudioTrackAt(i); }), "A" + (i + 1));
        }
        return JSON.stringify({ ok: anyRemoved, removed: anyRemoved, debug: debug });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e), debug: debug });
    }
}

// Total QE track-item count across all video + audio tracks. The panel uses
// this to verify whether a razor actually took effect (count goes up by ≥1
// per razored track if it worked).
function ccCountItems() {
    try {
        if (typeof app === "undefined" || !app || !app.project) return JSON.stringify({ ok: false, count: 0 });
        var seq = _ccSafe(function () { return app.project.activeSequence; });
        if (!seq) return JSON.stringify({ ok: false, count: 0 });
        if (typeof app.enableQE === "function") app.enableQE();
        var qeSeq = (typeof qe !== "undefined" && qe && qe.project && qe.project.getActiveSequence)
            ? qe.project.getActiveSequence() : null;
        if (!qeSeq) return JSON.stringify({ ok: false, count: 0 });
        var n = 0;
        var nv = _ccSafe(function () { return qeSeq.numVideoTracks; }) || 0;
        var na = _ccSafe(function () { return qeSeq.numAudioTracks; }) || 0;
        for (var i = 0; i < nv; i++) {
            var t = _ccSafe(function () { return qeSeq.getVideoTrackAt(i); });
            if (t) n += _ccSafe(function () { return t.numItems; }) || 0;
        }
        for (var i = 0; i < na; i++) {
            var t = _ccSafe(function () { return qeSeq.getAudioTrackAt(i); });
            if (t) n += _ccSafe(function () { return t.numItems; }) || 0;
        }
        return JSON.stringify({ ok: true, count: n });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e), count: 0 });
    }
}

// Ensure every video + audio track is "targeted" so Add Edit (Cmd+K) razors
// them. By default Premiere only targets the track header(s) the user
// clicked. Many Add Edit failures are silent because no tracks were targeted.
function ccTargetAllTracks() {
    try {
        var seq = _ccSafe(function () { return app.project.activeSequence; });
        if (!seq) return JSON.stringify({ ok: false, error: "no seq" });
        var nv = _ccSafe(function () { return seq.videoTracks && seq.videoTracks.numTracks; }) || 0;
        var na = _ccSafe(function () { return seq.audioTracks && seq.audioTracks.numTracks; }) || 0;
        for (var i = 0; i < nv; i++) {
            var t = _ccSafe(function () { return seq.videoTracks[i]; });
            if (t && t.setTargeted) _ccSafe(function () { t.setTargeted(true, true); });
        }
        for (var i = 0; i < na; i++) {
            var t = _ccSafe(function () { return seq.audioTracks[i]; });
            if (t && t.setTargeted) _ccSafe(function () { t.setTargeted(true, true); });
        }
        return JSON.stringify({ ok: true, videoTracks: nv, audioTracks: na });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
    }
}

// Try multiple in-process ways to trigger Premiere's Add Edit at the current
// playhead. Verifies by item-count delta. Returns which method (if any)
// actually razored, so the caller can skip the bridge osascript round-trip
// when in-process works.
function ccTryRazorAtPlayhead() {
    try {
        var beforeRes = JSON.parse(ccCountItems());
        var before = (beforeRes && typeof beforeRes.count === "number") ? beforeRes.count : 0;

        function delta() {
            var r = JSON.parse(ccCountItems());
            return (r && typeof r.count === "number") ? r.count - before : 0;
        }

        // app.executeCommand named variants — different Premiere builds
        // expose different names; try the common ones. Each is verified by
        // item-count delta so a wrong name that silently no-ops doesn't
        // false-claim success. Avoid menuFunctionId trial-and-error — wrong
        // IDs can fire destructive menu commands.
        var names = ["Add Edit to All Tracks", "Add Edit", "AddEditToAllTracks", "AddEdit"];
        if (typeof app.executeCommand === "function") {
            for (var n = 0; n < names.length; n++) {
                _ccSafe(function () { app.executeCommand(names[n]); });
                var d = delta();
                if (d > 0) return JSON.stringify({ ok: true, method: "executeCommand:" + names[n], delta: d });
            }
        }
        return JSON.stringify({ ok: false, method: "none", delta: 0 });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
    }
}

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
