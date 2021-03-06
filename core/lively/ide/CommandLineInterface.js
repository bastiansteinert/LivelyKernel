module('lively.ide.CommandLineInterface').requires('lively.Network', 'lively.morphic.Graphics').toRun(function() {

Object.extend(lively.ide.CommandLineInterface, {

    commandQueue: [],
    scheduleCommand: function(cmd) {
        this.commandQueue.push(cmd);
        lively.bindings.connect(this.commandInProgress, 'end', this, 'commandFromQueue');
    },
    commandFromQueue: function() {
        var cmd = this.commandQueue.shift();
        cmd && cmd.startRequest();
    },

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

    commandLineServerURL: URL.create(Config.nodeJSURL).asDirectory().withFilename('CommandLineServer/'),

    parseCommandIntoCommandAndArgs: function(cmd) {
        // lively.ide.CommandLineInterface.parseCommandIntoCommandAndArgs('grep o -')
        var result = [], word = '', state = 'normal';
        function add() { 
            if (word.length > 0) result.push(word); word = '';
        }
        for (var i = 0, c; c = cmd[i]; i++) {
            if (state === 'normal' && /\s/.test(c)) { add(); continue; }
            if (c === "\"" || c === "'") {
                if (state === 'normal') { state = c; continue; }
                if (state === c) { state = 'normal'; continue; }
            }
            if (c === '\\' && state === cmd[i+1]) { i++; c = cmd[i]; }
            word += c;
        }
        add();
        return result;
    },

    run: function(commandString, options, thenDo) {
        /*
        cmd = lively.ide.CommandLineInterface.run('ls', show);
        lively.ide.CommandLineInterface.run('grep 1 -', {stdin: '123\n567\n,4314'}, show);
        lively.ide.CommandLineInterface.kill();
        */
        thenDo = Object.isFunction(options) ? options : thenDo;
        options = !options || Object.isFunction(options) ? {} : options;
        var cmdLineInterface = this,
            parsedCommand = this.parseCommandIntoCommandAndArgs(commandString),
            webR = this.commandLineServerURL.asWebResource().beAsync(),
            ansiAttributesRegexp = !options.hasOwnProperty("ansiAttributeEscape") || options.ansiAttributeEscape ? this.ansiAttributesRegexp : null,
            cmd = {
                isShellCommand: true,
                streamPos: 0,
                interval: null,
                _stdout: '',
                _stderr: '',
                _code: '',

                readInterval: function() {
                    var xhr = webR.status && webR.status.transport;
                    if (!xhr) return;
                    this.read(xhr.responseText);
                },

                startInterval: function() {
                    this.endInterval();
                    this.interval = Global.setInterval(this.readInterval.bind(this), 50);
                },

                endInterval: function() {
                    if (this.interval) { Global.clearInterval(this.interval); }
                },

                read: function(string) {
                    var input = string.slice(this.streamPos, string.length),
                        headerMatch = input.match(/^<SHELLCOMMAND\$([A-Z]+)([0-9]+)>/);
                    if (!headerMatch) return;
                    // show('pos: %s, reading: %s', this.streamPos, string);
                    var header = headerMatch[0],
                        type = headerMatch[1].toLowerCase(),
                        length = Number(headerMatch[2]),
                        readContent = input.slice(header.length, header.length+length),
                        remaining = input.slice(header.length + length);
                    if (ansiAttributesRegexp) readContent = readContent.replace(ansiAttributesRegexp, '');
                    // show('type: %s, length: %s, content: %s, remaining: %s',
                    //     type, length, readContent, remaining);
                    lively.bindings.signal(this, type, readContent);
                    this['_' + type] += readContent;
                    this.streamPos += header.length + length;
                    if (this.streamPos < string.length) this.read(string);
                },

                startRequest: function() {
                    cmdLineInterface.commandInProgress = this;
                    webR.post(JSON.stringify({command: parsedCommand, stdin: options.stdin}), 'application/json');
                    this.startInterval();
                    lively.bindings.connect(webR, 'status', this, 'endRequest', {
                        updater: function($upd, status) {
                            if (status.isDone()) $upd.curry(status).delay(0.1); }});
                },

                endRequest: function(status) {
                    cmdLineInterface.commandInProgress = null;
                    this.endInterval();
                    this.read(status.transport.responseText);
                    lively.bindings.signal(this, 'end', this);
                    if (thenDo) thenDo(cmd);
                },

                getStdout: function() { return this._stdout || ''; },
                getStderr: function() { return this._stderr || ''; },
                getCode: function() { return Number(this._code); },
                resultString: function(bothErrAndOut) {
                    return bothErrAndOut ?
                        this.getStdout().trim() + '\n'+  this.getStderr().trim() :
                        (this.getCode() ? this.getStderr() : this.getStdout()).trim();
                }
            };
        if (!cmdLineInterface.commandInProgress) cmd.startRequest();
        else cmdLineInterface.scheduleCommand(cmd);
        return cmd;
    },

    exec: function(commandString, options, thenDo) {
        /*
        cmd = lively.ide.CommandLineInterface.exec('ls', show);
        cmdLineInterface= lively.ide.CommandLineInterface
        cmdLineInterface.commandInProgress = null
        cmd
        */
        thenDo = Object.isFunction(options) ? options : thenDo;
        options = !options || Object.isFunction(options) ? {} : options;
        var cmdLineInterface = this,
            webR = cmdLineInterface.commandLineServerURL.withFilename('exec').asWebResource(),
            cmd = {
                isShellCommand: true,
                _stdout: '',
                _stderr: '',
                _code: '',
                _done: false,

                startRequest: function() {
                    cmdLineInterface.commandInProgress = this;
                    lively.bindings.connect(webR, 'status', this, 'endRequest', {
                        updater: function($upd, status) { if (status.isDone()) $upd(status); }});
                    if (options.sync) webR.beSync();
                    else webR.beAsync();
                    webR.post(JSON.stringify({command: commandString}), 'application/json');
                },

                endRequest: function(status) {
                    this._done = true;
                    cmdLineInterface.commandInProgress = null;
                    try {
                        result = JSON.parse(status.transport.responseText);
                        this._code = result.code;
                        this._stderr = result.err;
                        this._stdout = result.out;
                    } catch(e) {
                        this._stderr = String(e);
                        this._code = -1;
                    }
                    lively.bindings.signal(this, 'end', this);
                    if (thenDo) thenDo(cmd);
                },

                getStdout: function() { return this._stdout || ''; },
                getStderr: function() { return this._stderr || ''; },
                getCode: function() { return Number(this._code); },
                kill: function() {
                    if (this._done) return;
                    if (lively.ide.CommandLineInterface.commandQueue.include(this)) {
                        lively.ide.CommandLineInterface.commandQueue.remove(this);
                    } else {
                        lively.ide.CommandLineInterface.kill(this);
                    }
                },
                resultString: function() {
                    var output = (!this.getCode() ? this.getStdout() : this.getStderr()) || '';
                    return output.trim(); }
            };
        if (!cmdLineInterface.commandInProgress) cmd.startRequest();
        else cmdLineInterface.scheduleCommand(cmd);
        return cmd;
    },

    execSync: function(commandString, options) {
        options = options || {};
        options.sync = true;
        return this.exec(commandString, options, null);
    },
    findFiles: function(pattern, options) {
        options = options || {};
        var path = options.path || '.';
        if (!path.endsWith('/')) path += '/';
        var timeFormatFix =
            "if [ `uname` == \"Darwin\" ]; "
          + "  then timeformat='-T'; "
          + "else "
          + "  timeformat=\"--time-style=+%b %d %T %Y\"; "
          + "fi && "
        var commandString = timeFormatFix + Strings.format(
            "env TZ=GMT find %s "
          + '\\( -iname ".svn" -o -iname ".svn" \\) -prune '
          + '-o -iname "%s" -exec ls -l \"$timeformat\" {} \\;',
            path, pattern)
        function parseFindLsResult(string) {
            var lines = Strings.lines(string);
            return lines.map(function(line) {
                // line like "-rw-r—r—       1 robert   staff       5298 Dec 17 14:04:02 2012 test.html"
                //                  file mode   no of links  user     group       size   date: month,day,   time,       year      file
                var match = line.match(/^\s*([^\s]+)\s+([0-9]+)\s+([^\s]+)\s+([^\s]+)\s+([0-9]+)\s+([^\s]+\s+[0-9]+\s+[0-9:]+\s+[0-9]+)\s+(.*)$/);
                return match ? {
                    mode: match[1],
                    // linkCount: Number(match[2]),
                    user: match[3],
                    group: match[4],
                    size: Number(match[5]),
                    lastModified: new Date(match[6] + ' GMT'),
                    path: match[7].replace(/\/\//g, '/')
                } : null;

            }).compact();
        }
        var result = [],
            cmd = this.exec(commandString, options, function(cmd) {
                if (cmd.getCode() != 0) { console.warn(cmd.getStderr()); return []; }
                result = parseFindLsResult(cmd.getStdout());
            });
        return options.sync ? result : cmd;
    },


    kill: function(cmd) {
        /*
        lively.ide.CommandLineInterface.kill();
        */
        var webR = this.commandLineServerURL.asWebResource()//.beAsync();
        return webR.del().content;
    },

    runAll: function(commands, thenDo) {
        // commands is an array of command spec objects like [
        //   {name: "cmd1", command: "ls -l"},
        //   {name: "cmd2", command: "echo ls: ${cmd1}"},
        // ];
        // simple reference of outputs is supported as seen above to allow
        // constructing commands out of former results
        /*
        lively.ide.CommandLineInterface.runAll([
          {name: "cmd1", command: "du -sh ."},
          {name: "cmd2", command: "echo dir size ${cmd1}"},
         ], show)
        lively.ide.CommandLineInterface.runAll([{name: "cmd1", command: "ls ."},], show);
        */
        thenDo = thenDo || Functions.Null;
        var results = {};
        commands.doAndContinue(function(next, ea, i) {
            // run either with exec by setting ea.isExec truthy, otherwise with run (spawn)
            var cmd = ea.command, runCommand;
            if (ea.isExec) runCommand = this.exec;
            else if (ea.readFile) { runCommand = this.readFile; cmd = ea.readFile; }
            else if (ea.writeFile) { runCommand = this.writeFile; cmd = ea.writeFile; ea.options = ea.options || {}; if (ea.content) ea.options.content = ea.content; }
            else runCommand = this.run;
            if (runCommand === this.run) {
                cmd = cmd.replace(/\$\{([^\}]+)\}/g, function(_, variable) {
                    return results[variable] && results[variable].isShellCommand ?
                        results[variable].resultString() : (results[variable] || ''); });
            }
            runCommand.call(this, cmd, ea.options || {}, function(cmd) {
                var name = ea.name || String(i);
                results[name] = ea.transform ? ea.transform(cmd) : cmd;
                next();
            });
        }, thenDo.curry(results), this);
    },

    getWorkingDirectory: function() {
        var webR = this.commandLineServerURL.asWebResource().beSync();
        try {
            return JSON.parse(webR.get().content).cwd;
        } catch(e) { return ''; }
    },
    
    setWorkingDirectory: function(dir) {
        throw new Error('not yet implemented');
    },

    readFile: function(path, options, thenDo) {
        options = options || {};
        var cmd = this.run('cat ' + path);
        if (options.onInput) lively.bindings.connect(cmd, 'stdout', options, 'onInput');
        if (options.onEnd) lively.bindings.connect(cmd, 'end', options, 'onEnd');
        if (thenDo) lively.bindings.connect(cmd, 'end', {thenDo: thenDo}, 'thenDo');
        return cmd;
    },

    writeFile: function(path, options, thenDo) {
        options = options || {};
        options.content = options.content || '';
        var cmd = this.run('tee ' + path, {stdin: options.content});
        if (options.onEnd) lively.bindings.connect(cmd, 'end', options, 'onEnd');
        if (thenDo) lively.bindings.connect(cmd, 'end', {thenDo: thenDo}, 'thenDo');
        return cmd;
    },

    diff: function(string1, string2, thenDo) {
        return lively.ide.CommandLineInterface.runAll([
            {command: 'mkdir -p diff-tmp/'},
            {writeFile: 'diff-tmp/a', content: string1},
            {writeFile: 'diff-tmp/b', content: string2},
            {name: 'diff', command: 'git diff --no-index --histogram diff-tmp/a diff-tmp/b'},
            {command: 'rm -rfd diff-tmp/'}
        ], function(result) { thenDo(result.diff.resultString(true)); });
    },

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

    ansiAttributes: {
        // "\033[7m"              {name: 'invert', style: {}},
        // "\033[5m"              {name: 'blink', style: {}},
        // "\033[0J"              {name: 'eod', style: {}},
        // "\033[1{;1f"           {name: 'sod', style: {}},
        // "\033[0K"              {name: 'eol', style: {}},
        "":   {style: 'reset'},
        "0":  {style: 'reset'},
        "1":  {style: {fontWeight: 'bold'}},
        "4":  {style: {textDecoration: 'underline'}},
        "30": {style: {color: Color.black}},
        "40": {style: {backgroundColor: Color.black}},
        "31": {style: {color: Color.red}},
        "41": {style: {backgroundColor: Color.red}},
        "32": {style: {color: Color.green}},
        "42": {style: {backgroundColor: Color.green}},
        "33": {style: {color: Color.yellow}},
        "43": {style: {backgroundColor: Color.yellow}},
        "34": {style: {color: Color.blue}},
        "44": {style: {backgroundColor: Color.blue}},
        "35": {style: {color: Color.magenta}},
        "45": {style: {backgroundColor: Color.magenta}},
        "36": {style: {color: Color.cyan}},
        "46": {style: {backgroundColor: Color.cyan}},
        "37": {style: {color: Color.white}},
        "47": {style: {backgroundColor: Color.white}}
    },

    ansiAttributesRegexp: new RegExp('\033\[[0-9;]*m', 'g'),

    toStyleSpec: function(string) {
        /*
        string = "hello\033[31m\033[4mwor\033[44mld\033[0m";
        result = lively.ide.CommandLineInterface.toStyleSpec(string);
        morph = new lively.morphic.Text(rect(0,0,100,20), result.string)
        morph.emphasizeRanges(result.ranges);
        morph.openInWorld().remove.bind(morph).delay(3);
        */

        var ansiAttributes = this.ansiAttributes, ansiAttributesRegexp = this.ansiAttributesRegexp;

        // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
        var indexOffset = 0, result = [0,[]], currentAttributes = [];
        string = string.replace(ansiAttributesRegexp, function(match, index) {
            // match can look like this "\033[31m" or this "\033[1;31m"
            var attributeCodes = match.slice(2,match.length-1).split(';'),
                styles = Object.keys(ansiAttributes).map(function(code) {
                    return attributeCodes.include(code) && ansiAttributes[code] && ansiAttributes[code].style; }).compact();
            if (styles.length === 0) { indexOffset += match.length; return ''; } // nothing found in our table...
            result.push(index-indexOffset);
            result.push(currentAttributes.clone());
            if (styles.include('reset')) currentAttributes = [];
            else currentAttributes.pushAll(styles);
            indexOffset += match.length;
            return '';
        });
        var lastIndex = result[result.length-2];
        if (lastIndex < string.length) result.push(string.length, currentAttributes);

        // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
        var ranges = [];
        for (var i = 0; i < result.length; i += 2) {
            var idx = result[i], styles = result[i+1];
            var nextIdx = result[i+2], nextStyles = result[i+3];
            if (idx === nextIdx) continue;
            if (!Object.isNumber(nextIdx)) break;
            ranges.push([idx, nextIdx, Object.merge(nextStyles)]);
        }
        return {string: string, ranges: ranges};
    }

});

Object.subclass("lively.ide.FilePatch",
'initializing', {
    read: function(patchString) {
        // simple parser for unified patch format;
        var lines = patchString.split('\n'), line, hunks = this.hunks = [];
        if (lines[lines.length-1] === '') lines.pop();

        // 1: parse header
        // line 0 like: "diff --git a/test.txt b/test.txt\n"
        line = lines.shift();
        if (line.match(/^diff/)) { this.command = line; line = lines.shift(); }
        if (line.match('^index')) { line = lines.shift(); }

        lively.assert(line.match(/^---/), 'patch parser line 2');
        this.pathOriginal = line.split(' ').last();
        line = lines.shift();

        lively.assert(line.match(/^\+\+\+/), 'patch parser line 3');
        this.pathChanged = line.split(' ').last();

        while (lines.length > 0) {
            hunks.push(lively.ide.FilePatchHunk.read(lines));
        }
        return this;
    }
},
'patch creation', {
    createPatchStringHeader: function() {
        var parts = [];
        if (this.command) parts.push(this.command);
        parts.push('--- ' + this.pathOriginal);
        parts.push('+++ ' + this.pathChanged);
        return parts.join('\n');
    },

    createPatchString: function() {
        return this.createPatchStringHeader() + '\n'
             + this.hunks.invoke('createPatchString').join('\n');
    },

    createPatchStringFromRows: function(startRow, endRow) {
        var nHeaderLines = [this.command, this.pathOriginal, this.pathChanged].compact().length,
            hunkPatches = [];
        startRow = Math.max(startRow, nHeaderLines)-nHeaderLines;
        endRow -= nHeaderLines;
        var hunkPatches = this.hunks.map(function(hunk) {
            var patch = hunk.createPatchStringFromRows(startRow, endRow);
            startRow -= hunk.length;
            endRow -= hunk.length;
            return patch;
        }).compact();
        if (hunkPatches.length === 0) return null;
        return this.createPatchStringHeader() + '\n' + hunkPatches.join('\n') + '\n';
    }
});

Object.extend(lively.ide.FilePatch, {
    read: function(patchString) { return new this().read(patchString); }
});

Object.subclass("lively.ide.FilePatchHunk",
'initialize', {
    read: function(lines) {
        // parse header
        var header = lines.shift(),
            headerMatch = header.match(/^@@\s*-([0-9]+),?([0-9]*)\s*\+([0-9]+),?([0-9]*)\s*@@/);
        lively.assert(headerMatch, 'hunk header ' + header);
        this.header = headerMatch[0];
        this.originalLine = Number(headerMatch[1]);
        this.originalLength = Number(headerMatch[2]);
        this.changedLine = Number(headerMatch[3]);
        this.changedLength = Number(headerMatch[4]);
        // parse context/addition/deletions
        this.lines = [];
        while (lines[0] && !lines[0].match(/^@@/)) {
            this.lines.push(lines.shift());
        }
        this.length = this.lines.length + 1; // for header
        return this;
    }
},
'patch creation', {
    createPatchString: function() {
        return [this.header].concat(this.lines).join('\n');
    },
    createPatchStringFromRows2: function(startRow, endRow) {
        // row 0 is the header
        var origLine = this.originalLine,
            changedLine = this.changedLine,
            origLength = this.originalLength,
            changedLength = this.changedLength,
            lines = [], header;
        this.lines.forEach(function(line, i) {
            i++; // compensate for header
            if (i < startRow) {
                switch (line[0]) {
                    case ' ': changedLine++; origLine++; changedLength--; origLength--; return;
                    case '-': changedLine++; origLine++; origLength--; return;
                    case '+': changedLength--; return;
                    default: return;
                }
            }
            if (i > endRow) {
                switch (line[0]) {
                    case ' ': changedLength--; origLength--; return;
                    case '-': origLength--; return;
                    case '+': changedLength--; return;
                    default: return;
                }
            }
            lines.push(line);

        });
        if (lines.length === 0) return null;
        header = Strings.format('@@ -%s,%s +%s,%s @@',
            origLine, origLength, changedLine, changedLength);
        return [header].concat(lines).join('\n');
    },

    createPatchStringFromRows: function(startRow, endRow) {
        if (endRow < 1 || startRow >= this.lines.length) return null;

        // row 0 is the header
        var origLine = this.originalLine,
            changedLine = this.changedLine,
            origLength = 0,
            changedLength = 0,
            lines = [], header;

        this.lines.clone().forEach(function(line, i) {
            i++; // compensate for header
            if (i < startRow || i > endRow) {
                switch (line[0]) {
                    case '-': line = ' ' + line.slice(1);
                    case ' ': changedLength++; origLength++; break;
                    case '+': return;
                }
            } else {
                switch (line[0]) {
                    case ' ': changedLength++; origLength++; break;
                    case '-': origLength++; break;
                    case '+': changedLength++; break;
                }
            }
            lines.push(line);
        });

        if (lines.length === 0) return null;
        header = Strings.format('@@ -%s,%s +%s,%s @@',
            origLine, origLength, changedLine, changedLength);
        return [header].concat(lines).join('\n');
    }

});

Object.extend(lively.ide.FilePatchHunk, {
    read: function(patchString) { return new this().read(patchString); }
});

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

Object.extend(lively.ide, {
    CommandLineSearch: {
        doGrepFromWorkspace: function(string, path, thenDo) {
            // will automaticelly insert grep results into currently focused workspace
            var focused = lively.morphic.Morph.focusedMorph(),
                codeEditor = focused instanceof lively.morphic.CodeEditor && focused;
            lively.ide.CommandLineSearch.doGrep(string, path, function(lines) {
                thenDo && thenDo(lines);
                if (!focused) return;
                var out = lines.length === 0 ? 'nothing found' : lines.join('\n');
                focused.printObject(null, '\n' + lines.join('\n'));
                var sel = focused.getSelection();
                sel.moveCursorToPosition(focused.indexToPosition(focused.positionToIndex(sel.anchor) + 1));
                sel.clearSelection();
            });
        },
        doGrep: function(string, path, thenDo) {
            var lastGrep = lively.ide.CommandLineSearch.lastGrep;
            if (lastGrep) lastGrep.kill();
            path = path || 'lively';
            var cmd = Strings.format("find %s -iname '*js' -exec grep -inH %s '{}' \\; ",
                '$WORKSPACE_LK/core/' + path,
                string);
            // var cmd = 'grep -nR ' + string + ' $WORKSPACE_LK/core/' + path + '/*.js';
            lively.ide.CommandLineSearch.lastGrep = lively.shell.exec(cmd, function(r) {
                lively.ide.CommandLineSearch.lastGrep = null;
                var lines = r.getStdout().split('\n')
                    .map(function(line) { return line.slice(line.indexOf('/core') + 6); })
                thenDo && thenDo(lines);
            });
        },

        // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
        // browsing
        getCurrentBrowser: function(spec) {
            var focused = lively.morphic.Morph.focusedMorph(),
                win = focused && focused.getWindow(),
                widget = win && win.targetMorph.ownerWidget,
                browser = widget && widget.isSystemBrowser ? widget : null;
            return browser;
        },
        doBrowse: function(spec) {
            var modWrapper =lively.ide.sourceDB().addModule(spec.fileName),
                ff = modWrapper.ast();
            if (spec.line) ff = ff.getSubElementAtLine(spec.line, 20/*depth*/) || ff;
            ff && ff.browseIt({line: spec.line/*, browser: getCurrentBrowser()*/});
        },
        extractBrowseRefFromGrepLine: function(line) {
            // extractBrowseRefFromGrepLine("lively/morphic/HTML.js:235:    foo")
            // = {fileName: "lively/morphic/HTML.js", line: 235}
            var fileMatch = line.match(/((?:[^\/\s]+\/)*[^\.]+\.[^:]+):([0-9]+)/);
            return fileMatch ? {fileName: fileMatch[1], line: Number(fileMatch[2])} : null;
        },
        extractModuleNameFromLine: function(line) {
            var match = line.match(/([a-zA-Z0-9_-]+\.)+[a-zA-Z0-9_-]+/);
            if (!match || !match[0]) return null;
            return {fileName: module(match[0]).relativePath('js')};
        },
        doBrowseGrepString: function(grepString) {
            var spec = this.extractBrowseRefFromGrepLine(grepString);
            if (!spec) {
                show("cannot extract browse ref from %s", grepString);
            } else {
                this.doBrowse(spec);
            }
        },

        doBrowseAtPointOrRegion: function(codeEditor) {
            try { 
                var str = codeEditor.getSelectionOrLineString();
                str = str.replace(/\/\//g, '/');
                var spec = this.extractBrowseRefFromGrepLine(str) || this.extractModuleNameFromLine(str);
                if (!spec) {
                    show("cannot extract browse ref from %s", str);
                } else {
                    this.doBrowse(spec);
                }
            } catch(e) {
                show('failure in doBrowseAtPointOrRegion: %s', e.stack);
            }
        }
    }
});

Object.extend(lively, {
    shell: lively.ide.CommandLineInterface,
    grep: lively.ide.CommandLineSearch.doGrepFromWorkspace
});

Object.extend(Global, {
    $grep: lively.ide.CommandLineSearch.doGrepFromWorkspace
});

}) // end of module