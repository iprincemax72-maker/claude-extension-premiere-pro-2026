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
