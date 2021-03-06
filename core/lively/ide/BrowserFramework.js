module('lively.ide.BrowserFramework').requires('lively.morphic.MorphAddons', 'lively.ide.CodeEditor', 'lively.morphic.Widgets').toRun(function() {

lively.morphic.WindowedApp.subclass('lively.ide.BasicBrowser',
'settings', {
    documentation: 'Abstract widget with three list panes and one text pane. Uses nodes to display and manipulate content.',
    emptyText: '-----',
    connections: ['targetURL', 'sourceString', 'pane1Selection', 'pane2Selection', 'pane3Selection', 'pane4Selection']
},
'initializing', {

    initialViewExtent: (function() {
        var ext = Config.get("defaultSCBExtent");
        return pt(ext[0], ext[1]);
    })(),

    panelSpec: [
        ['locationPane', newTextPane,                                                        [0,    0,    0.8,  0.03]],
        ['codeBaseDirBtn', function(bnds) { return new lively.morphic.Button(bnds) },        [0.8,  0,    0.12, 0.03]],
        ['localDirBtn', function(bnds) { return new lively.morphic.Button(bnds) },           [0.92, 0,    0.08, 0.03]],
        ['Pane1', newDragnDropListPane,                                                      [0,    0.03, 0.25, 0.37]],
        ['Pane2', newDragnDropListPane,                                                      [0.25, 0.03, 0.25, 0.37]],
        ['Pane3', newDragnDropListPane,                                                      [0.5,  0.03, 0.25, 0.37]],
        ['Pane4', newDragnDropListPane,                                                      [0.75, 0.03, 0.25, 0.37]],
        ['midResizer', function(bnds) { return new lively.morphic.HorizontalDivider(bnds) }, [0,    0.44, 1,    0.01]],
        ['sourcePane', lively.ide.newCodeEditor,                                             [0,    0.45, 1,    0.54]]
    ],

    allPaneNames: ['Pane1', 'Pane2', 'Pane3', 'Pane4'],

    filterPlaces: ['Root', 'Pane1', 'Pane2', 'Pane3', 'Pane4'],

    formals: ["Pane1Content", "Pane1Selection", "Pane1Menu", "Pane1Filters",
            "Pane2Content", "Pane2Selection", "Pane2Menu", "Pane2Filters",
            "Pane3Content", "Pane3Selection", "Pane3Menu", "Pane3Filters",
            "Pane4Content", "Pane4Selection", "Pane4Menu", "Pane4Filters",
            "SourceString", "StatusMessage", "RootFilters"],

    initialize: function($super) {
        $super();
        this.buttonCommands = [];
        // init filters
        this.filterPlaces.forEach(function(ea) {  /*identity filter*/
            this['set' + ea + 'Filters']([new lively.ide.NodeFilter()]);
        }, this);
    },
    setupListPanes: function() {
        var browser = this;
        function setupListPane(paneName) {
            var pane = browser.panel[paneName],
                list = pane.innerMorph();
            pane.applyStyle({scaleProportional: true});
            lively.bindings.connect(list, 'selection', browser, 'set' + paneName + 'Selection', {
                updater: function($upd, v) {
                    var browser = this.targetObj, list = this.sourceObj;
                    browser.ensureSourceNotAccidentlyDeleted($upd.curry(v, list));
                }});
            list.plugTo(browser, {
                getSelection: '->get' + paneName + 'Selection',
                getList: '->get' + paneName + 'Content',
                getMenu: '->get' + paneName + 'Menu',
                updateList: '<-set' + paneName + 'Content'
            })
            pane.plugTo(browser, {
                getMenu: '->get' + paneName + 'Menu'
            })
            pane.addMenuButton();
            // overwriting event handlers so that list items can be selected using keys
            // and focus is still on the list and not the source pane
            list.addScript(function onDownPressed(evt) {
                $super(evt);
                this.focus.bind(this).delay(0);
                return true;
            })
            list.addScript(function onUpPressed(evt) {
                $super(evt);
                this.focus.bind(this).delay(0);
                return true;
            })
        }
        this.allPaneNames.forEach(function(ea) { setupListPane(ea) });
    },
    setupSourceInput: function() {
        var codeEditor = this.panel.sourcePane;
        codeEditor.applyStyle({
            clipMode: 'auto',
            fixedHeight: true,
            fixedWidth: true,
            fontFamily: Config.get('defaultCodeFontFamily'),
            fontSize: Config.get('defaultCodeFontSize'),
            padding: Rectangle.inset(5,5,5,5),
            // layouting poliy
            scaleProportional: true,
            accessibleInInactiveWindow: true
        });

        codeEditor.evalEnabled = false;

        if (codeEditor.enableSyntaxHighlighting) {
            codeEditor.enableSyntaxHighlighting();
        }

        codeEditor.plugTo(this, {
            setTextString: {dir: '<-', name: 'setSourceString', options: {
                updater: function($upd, val) {
                    $upd(val);
                    var sourcePane = this.targetObj;
                    lively.bindings.noUpdate(function() {
                        sourcePane.savedTextString = val; });
                }}},
            // pass codeEditor (sourceObj of connection) in setSourceString as
            // the "source" of that update:
            savedTextString: {dir: '->', name: 'setSourceString', options: {
                updater: function($upd, val) { $upd(val, this.sourceObj); }}}
        });
        this.setSourceString('-----');
    },

    buildView: function (extent) {
        extent = extent || this.initialViewExtent;
        var panel = new lively.ide.BrowserPanel(extent);
        lively.morphic.Panel.makePanedPanel(extent, this.panelSpec, panel);
        panel.applyStyle({fill: Color.lightGray});
        this.panel = panel;
        this.setupListPanes();
        this.setupSourceInput();
        this.setupLocationInput();
        this.buildCommandButtons(panel);
        this.setupResizers(panel);
        panel.ownerWidget = this;
        this.start();
        return panel;
    },

    setupLocationInput: function() {
        var locInput = this.locationInput();
        if (!locInput) return;
        locInput.beInputLine({fixedWidth: true, fixedHeight: true, fontSize: 10, scaleProportional: true, padding: Rectangle.inset(1)});
        locInput.evalEnabled = false;
    },

    setupResizers: function() {
        var panel = this.panel;

        // for compatibility to old pages -- FIXME remove
        if (!panel.midResizer) return
        // resizer in the middle resiszes top panes, buttons and source pane
        this.allPaneNames.collect(function(name) {
            panel.midResizer.addScalingAbove(panel[name]);
        });
        panel.midResizer.addScalingBelow(panel.sourcePane)

        // buttons
        panel.submorphs.forEach(function(m) {
            if (m instanceof lively.morphic.Button && m != panel.codeBaseDirBtn && m != panel.localDirBtn) {
                panel.midResizer.addFixed(m);
            }
        });

        (function() {
            panel.midResizer.divideRelativeToParent(1-Config.get("defaultSCBSourcePaneToListPaneRatio"));
        }).delay(0);

        panel.midResizer.linkToStyles(["Browser_resizer"]);
    },

    buildCommandButtons: function(morph) {
        var cmds = this.commands()
            .collect(function(ea) { return new ea(this) }, this)
            .select(function(ea) { return ea.wantsButton() });

        if (cmds.length === 0) return;

        var height = Math.round(morph.getExtent().y * 0.04),
            width = morph.getExtent().x / cmds.length,
            y = morph.getExtent().y * 0.44 - height,
            btns = cmds.forEach(function(cmd, i) {
                // Refactor me!!!
                var btn = new lively.morphic.Button(new Rectangle(i*width, y, width, height));
                btn.command = cmd; // used in connection
                btn.setLabel(cmd.asString());
                lively.bindings.connect(btn, 'fire', cmd, 'trigger');
                lively.bindings.connect(btn, 'fire', btn, 'setLabel', {
                    converter: function() { return this.getSourceObj().command.asString() }
                });
                cmd.button = btn; // used in onPaneXUpdate, to be removed!!!
                morph.addMorph(btn);
                btn.applyStyle({padding: Rectangle.inset(0,4),
                                scaleProportional: true,
                                label: {fontSize: 9}})
            })
        this.buttonCommands = cmds;
    },

    start: function() {
        this.setPane1Content(this.childsFilteredAndAsListItems(this.rootNode(), this.getRootFilters()));
        this.mySourceControl().registerBrowser(this);
    },

    stop: function() {
        this.mySourceControl().unregisterBrowser(this);
    }

},
'generated formal getters and setters', {
    generateGetterAndSetterSource: function() {
        this.formals.inject('', function(str, spec) {
            str += Strings.format('get%s: function() { return this.%s },\n', spec, spec);
            str += Strings.format('set%s: function(value, source) {\n\tthis.%s = value;\n\tif (this.on%sUpdate) this.on%sUpdate(value, source);\n\treturn value\n},\n', spec, spec, spec, spec);
            return str;
        })
    },
    getPane1Content: function() { return this.Pane1Content },
    setPane1Content: function(value, source) {
        this.Pane1Content = value;
        if (this.onPane1ContentUpdate) this.onPane1ContentUpdate(value, source);
        return value;
    },
    getPane1Selection: function() { return this.Pane1Selection },
    setPane1Selection: function(value, source) {
        this.Pane1Selection = value;
        if (this.onPane1SelectionUpdate) this.onPane1SelectionUpdate(value, source);
        return value;
    },
    getPane1Menu: function() { return this.Pane1Menu },
    setPane1Menu: function(value, source) {
        this.Pane1Menu = value;
        if (this.onPane1MenuUpdate) this.onPane1MenuUpdate(value, source);
        return value;
    },
    getPane1Filters: function() { return this.Pane1Filters },
    setPane1Filters: function(value, source) {
        this.Pane1Filters = value;
        if (this.onPane1FiltersUpdate) this.onPane1FiltersUpdate(value, source);
        return value;
    },
    getPane2Content: function() { return this.Pane2Content },
    setPane2Content: function(value, source) {
        this.Pane2Content = value;
        if (this.onPane2ContentUpdate) this.onPane2ContentUpdate(value, source);
        return value;
    },
    getPane2Selection: function() { return this.Pane2Selection },
    setPane2Selection: function(value, source) {
        this.Pane2Selection = value;
        if (this.onPane2SelectionUpdate) this.onPane2SelectionUpdate(value, source);
        return value;
    },
    getPane2Menu: function() { return this.Pane2Menu },
    setPane2Menu: function(value, source) {
        this.Pane2Menu = value;
        if (this.onPane2MenuUpdate) this.onPane2MenuUpdate(value, source);
        return value;
    },
    getPane2Filters: function() { return this.Pane2Filters },
    setPane2Filters: function(value, source) {
        this.Pane2Filters = value;
        if (this.onPane2FiltersUpdate) this.onPane2FiltersUpdate(value, source);
        return value;
    },
    getPane3Content: function() { return this.Pane3Content },
    setPane3Content: function(value, source) {
        this.Pane3Content = value;
        if (this.onPane3ContentUpdate) this.onPane3ContentUpdate(value, source);
        return value;
    },
    getPane3Selection: function() { return this.Pane3Selection },
    setPane3Selection: function(value, source) {
        this.Pane3Selection = value;
        if (this.onPane3SelectionUpdate) this.onPane3SelectionUpdate(value, source);
        return value;
    },
    getPane3Menu: function() { return this.Pane3Menu },
    setPane3Menu: function(value, source) {
        this.Pane3Menu = value;
        if (this.onPane3MenuUpdate) this.onPane3MenuUpdate(value, source);
        return value;
    },
    getPane3Filters: function() { return this.Pane3Filters },
    setPane3Filters: function(value, source) {
        this.Pane3Filters = value;
        if (this.onPane3FiltersUpdate) this.onPane3FiltersUpdate(value, source);
        return value;
    },
    getPane4Content: function() { return this.Pane4Content },
    setPane4Content: function(value, source) {
        this.Pane4Content = value;
        if (this.onPane4ContentUpdate) this.onPane4ContentUpdate(value, source);
        return value;
    },
    getPane4Selection: function() { return this.Pane4Selection },
    setPane4Selection: function(value, source) {
        this.Pane4Selection = value;
        if (this.onPane4SelectionUpdate) this.onPane4SelectionUpdate(value, source);
        return value;
    },
    getPane4Menu: function() { return this.Pane4Menu },
    setPane4Menu: function(value, source) {
        this.Pane4Menu = value;
        if (this.onPane4MenuUpdate) this.onPane4MenuUpdate(value, source);
        return value;
    },
    getPane4Filters: function() { return this.Pane4Filters },
    setPane4Filters: function(value, source) {
        this.Pane4Filters = value;
        if (this.onPane4FiltersUpdate) this.onPane4FiltersUpdate(value, source);
        return value;
    },
    getSourceString: function() { return this.SourceString },
    setSourceString: function(value, source) {
        this.SourceString = value;
        if (this.onSourceStringUpdate) this.onSourceStringUpdate(value, source);
        return value;
    },
    getStatusMessage: function() { return this.StatusMessage },
    getRootFilters: function() { return this.RootFilters },
    setRootFilters: function(value, source) {
        this.RootFilters = value;
        if (this.onRootFiltersUpdate) this.onRootFiltersUpdate(value, source);
        return value;
    },
},
'testing', {
    hasUnsavedChanges: function() {
        return this.panel.sourcePane.innerMorph().hasUnsavedChanges();
    },
},
'accessing', {

    commands: function() { return [] },

    locationInput: function() { return this.panel.locationPane && this.panel.locationPane.innerMorph() },

    sourceInput: function() { return this.panel.sourcePane.innerMorph() },

    mySourceControl: function() {
        var ctrl = lively.ide.startSourceControl();
        if (!ctrl) throw new Error('Browser has no SourceControl!');
        return ctrl;
    },
},
'browser nodes', {

    rootNode: function() {
        throw dbgOn(new Error('To be implemented from subclass'));
    },

    selectedNode: function() {
        return this.getPane4Selection() || this.getPane3Selection() || this.getPane2Selection() || this.getPane1Selection();
    },

    allNodes: function() {
        return this.allPaneNames.collect(function(ea) { return this.nodesInPane(ea) }, this).flatten();
    },

    nodesInSamePaneAs: function(node) {
        var siblings = this.allPaneNames
                       .collect(function(ea) { return this.nodesInPane(ea) }, this)
                       .detect(function(ea) { return ea.include(node) });
        return siblings || [];
    },

    nodesInPane: function(paneName) { // panes have listItems, no nodes
        var listItems = this['get' + paneName + 'Content']();
        if (!listItems) return [];
        if (!listItems.collect) {
            console.log('Weird bug: listItems: ' + listItems + ' has no collect in pane ' + paneName);
            return [];
        }
        return listItems.collect(function(ea) { return ea.value })
    },

    paneNameOfNode: function(node) {
        return this.allPaneNames.detect(function(pane) {
            // FIXME quality
            return this.nodesInPane(pane).any(function(otherNode) { return otherNode.target == node.target })
        }, this);
    },

    selectionInPane: function(pane) {
        return this['get'+pane+'Selection']();
    },

    childsFilteredAndAsListItems: function(node, filters) {
        return     this.filterChildNodesOf(node, filters || []).collect(function(ea) { return ea.asListItem() });
    },

    filterChildNodesOf: function(node, filters) {
        return filters.inject(node.childNodes(), function(nodes, filter) {
            return filter.apply(nodes)
        });
    },

     inPaneSelectNodeNamed: function(paneName,  nodeName) {
        return this.inPaneSelectNodeMatching(paneName, function(node) {
            return node && node.asString && node.asString().replace(/ ?\(.*\)/,"").endsWith(nodeName) });
    },

    inPaneSelectNodeMatching: function(paneName,  test) {
        var listItems = this['get' + paneName + 'Content']();
        if (!listItems) return null;
        var nodes = listItems.pluck('value');
        var wanted = nodes.detect(test);
        if (!wanted) return null;
        var list = this.panel[paneName].innerMorph();
        // list.onSelectionUpdate(wanted);
        list.setSelection(wanted);
        return wanted;
    },

    selectNode: function(node) {
        return this.selectNodeMatching(function(otherNode) { return node == otherNode });
        // var paneName = this.paneNameOfNode(node);
        // if (!paneName) return;
        // this.inPaneSelectNodeNamed(paneName, node.asString());
    },

    selectNodeMatching: function(testFunc) {
        for (var i = 0; i < this.allPaneNames.length; i++) {
            var paneName = this.allPaneNames[i];
            var node = this.inPaneSelectNodeMatching(paneName, testFunc);
            if (node) return node;
        }
        return null;
    },
    selectNodeNamed: function(name) {
        return this.selectNodeMatching(function(node) {
            return node && node.asString && node.asString().include(name);
        });
    },
    selectNothing: function() {
        if (this.panel) this.setPane1Selection(null, true);
    },


    onPane1SelectionUpdate: function(node) {
        this.pane1Selection = node; // for bindings

        this.panel['Pane2'] && this.panel['Pane2'].innerMorph().clearFilter(); // FIXME, lis filter, not a browser filter!

        this.setPane2Selection(null, true);
        this.setPane2Content([this.emptyText]);
        if (!node || !node.sourceString) return;

        this.setPane2Content(this.childsFilteredAndAsListItems(node, this.getPane1Filters()));
        this.setSourceString(node.sourceString());
        this.updateTitle();

        this.setPane1Menu(node.menuSpec().concat(this.commandMenuSpec('Pane1')));
        this.setPane2Menu(this.commandMenuSpec('Pane2'));
        this.setPane3Menu(this.commandMenuSpec('Pane3'));

        this.buttonCommands.forEach(function(cmd) { cmd.button.setIsActive(cmd.isActive()) })

        node.onSelect();
    },

    onPane2SelectionUpdate: function(node) {

        this.pane2Selection = node; // for bindings

        this.panel['Pane3'] && this.panel['Pane3'].innerMorph().clearFilter(); // FIXME, lis filter, not a browser filter!

        this.setPane3Selection(null);
        this.setPane3Content([this.emptyText]);
        if (!node || !node.sourceString) return;

        this.setPane3Content(this.childsFilteredAndAsListItems(node, this.getPane2Filters()));
        this.setSourceString(node.sourceString());
        this.updateTitle();

        this.setPane2Menu(node.menuSpec().concat(this.commandMenuSpec('Pane2')));
        this.setPane3Menu(this.commandMenuSpec('Pane3'));

        this.buttonCommands.forEach(function(cmd) { cmd.button.setIsActive(cmd.isActive()) })

        node.onSelect();
    },

    onPane3SelectionUpdate: function(node) {
        this.pane3Selection = node; // for bindings

        this.panel['Pane4'] && this.panel['Pane4'].innerMorph().clearFilter(); // FIXME, lis filter, not a browser filter!

        this.setPane4Selection(null);
        this.setPane4Content([this.emptyText]);
        if (!node || !node.sourceString) return;

        this.setPane4Content(this.childsFilteredAndAsListItems(node, this.getPane3Filters()));
        this.setSourceString(node.sourceString());
        this.updateTitle();

        this.setPane3Menu(node.menuSpec().concat(this.commandMenuSpec('Pane3')));
        this.setPane4Menu(this.commandMenuSpec('Pane4'));

        this.buttonCommands.forEach(function(cmd) { cmd.button.setIsActive(cmd.isActive()) })

        node.onSelect();
    },

    onPane4SelectionUpdate: function(node) {
        this.pane4Selection = node; // for bindings

        if (!node || !node.sourceString) return;

        this.setSourceString(node.sourceString());
        this.updateTitle();

        this.setPane4Menu(node.menuSpec().concat(this.commandMenuSpec('Pane4')));
        this.buttonCommands.forEach(function(cmd) { cmd.button.setIsActive(cmd.isActive()) })

        node.onSelect();
    },

    onSourceStringUpdate: function(methodString, source) {
        this.sourceString = methodString;
        if (!methodString || methodString == this.emptyText || !this.selectedNode()) return;
        var textMorph = this.panel.sourcePane.innerMorph();
        if (this.selectedNode().sourceString() == methodString && source !== textMorph) return;
        this.selectedNode().newSource(methodString);
        this.nodeChanged(this.selectedNode());
    },

    onPane1ContentUpdate: function() {
    },

    onPane2ContentUpdate: function() {
    },

    onPane3ContentUpdate: function(items, source) {
        if (source !== this.panel.Pane3.innerMorph())
            return;
        // handle drag and drop of items
        console.log('Got ' + items);
    },

    onPane4ContentUpdate: function(items, source) {
    },

    onPane1MenuUpdate: Functions.Null,
    onPane2MenuUpdate: Functions.Null,
    onPane3MenuUpdate: Functions.Null,
    onPane4MenuUpdate: Functions.Null,
    onPane1FiltersUpdate: Functions.Null,
    onPane2FiltersUpdate: Functions.Null,
    onPane3FiltersUpdate: Functions.Null,
    onPane4FiltersUpdate: Functions.Null,
    onStatusMessageUpdate: Functions.Null,
    onRootFiltersUpdate: Functions.Null,

    allChanged: function(keepUnsavedChanges, changedNode) {
        // optimization: if no node looks like the changed node in my browser do nothing
        if (changedNode && this.allNodes().every(function(ea) {return !changedNode.hasSimilarTarget(ea)}))
            return;

        // FIXME remove duplication
        var oldN1 = this.getPane1Selection();
        var oldN2 = this.getPane2Selection();
        var oldN3 = this.getPane3Selection();
        var oldN4 = this.getPane4Selection();

        var sourcePos = this.panel.sourcePane.getVerticalScrollPosition();

        var src = keepUnsavedChanges &&
                    this.hasUnsavedChanges() &&
                    this.panel.sourcePane.innerMorph().textString;

        if (this.hasUnsavedChanges())
            this.setSourceString(this.emptyText);

        var revertStateOfPane = function(paneName, oldNode) {
            if (!oldNode) return;
            var nodes = this.nodesInPane(paneName);
            var newNode = nodes.detect(function(ea) {
                return ea && ea.target &&
                    (ea.target == oldNode.target || (ea.target.eq && ea.target.eq(oldNode.target)))
            });
            if (!newNode)
                newNode = nodes.detect(function(ea) {return ea && ea.asString() === oldNode.asString()});
               this['set' + paneName + 'Selection'](newNode, true);
        }.bind(this);

        this.start(); // select rootNode and generate new subnodes

        revertStateOfPane('Pane1', oldN1);
        revertStateOfPane('Pane2', oldN2);
        revertStateOfPane('Pane3', oldN3);
        revertStateOfPane('Pane4', oldN4);

        if (!src) {
            this.panel.sourcePane.setVerticalScrollPosition(sourcePos);
            return;
        }

        //this.setSourceString(src);
        var text = this.panel.sourcePane.innerMorph();
        text.setTextString(src.toString());
        this.panel.sourcePane.setVerticalScrollPosition(sourcePos);
        // text.changed()
        text.showChangeClue(); // FIXME
    },

    nodeChanged: function(node) {
        // currently update everything, this isn't really necessary
          this.allChanged();
    },

    textChanged: function(node) {
        // be careful -- this can lead to overwritten source code
        var pane = this.paneNameOfNode(node);
        if (!pane) return;
        this.inPaneSelectNodeMatching(pane, Functions.False); // unselect
        this.inPaneSelectNodeMatching(pane, function(other) { return other.target == node.target });
        // this.setSourceString(node.sourceString());
    },

    signalNewSource: function(changedNode) {
        this.mySourceControl().updateBrowsers(this, changedNode);
    },

    updateTitle: Functions.debounce(50, function() {
        var window = this.panel.owner;
        if (!window) return;
        var n1 = this.getPane1Selection(),
            n2 = this.getPane2Selection(),
            n3 = this.getPane3Selection(),
            n4 = this.getPane4Selection(),
            title = '';
        if (n1) title += n1.asString();
        if (n2) title += ':' + n2.asString();
        if (n3) title += ':' + n3.asString();
        if (n4) title += ':' + n4.asString();
        if (title.length === 0) title = this.constructor.name;
        window.setTitle(title);
    }),

},
'browser related', {

    installFilter: function(filter, paneName) {
        var getter = 'get' + paneName + 'Filters';
        var setter = 'set' + paneName + 'Filters';
        this[setter](this[getter]().concat([filter]).uniq());
    },

    uninstallFilters: function(testFunc, paneName) {
        // testFunc returns true if the filter should be removed
        var getter = 'get' + paneName + 'Filters';
        var setter = 'set' + paneName + 'Filters';
        this[setter](this[getter]().reject(testFunc));
    },

    commandMenuSpec: function(pane) {
        var result = this.commands()
            .collect(function(ea) { return new ea(this); }, this)
            .select(function(ea) { return ea.wantsMenu() && ea.isActive(pane); })
            .inject([], function(all, ea) { return all.concat(ea.trigger()); });
        if (result.length > 0) result.unshift(['-------']);
        return result;
    },

    setStatusMessage: function(msg, color, delay) {
        this.panel.sourcePane.setStatusMessage(msg, color, delay);
    },

    world: function() {
        return this.panel.world() || lively.morphic.World.current();
    },

    confirm: function(question, callback) {
        this.world().confirm(question, callback.bind(this));
    },

    ensureSourceNotAccidentlyDeleted: function (callback) {
        // checks if the source code has unsaved changes if it hasn't or if the
        // user wants to discard them then run the callback
        // otherwise do nothing
        var browser = this;
        if (!browser.hasUnsavedChanges()) {
            callback.apply(browser);
            return;
        }
        browser.confirm('There are unsaved changes. Discard them?',
            function(answer) { answer && callback.apply(browser); });
    }
},
'source pane', {
    selectStringInSourcePane: function(string) {
        var textMorph = this.panel.sourcePane.innerMorph(),
            index = textMorph.textString.indexOf(string);
        textMorph.requestKeyboardFocus(lively.morphic.World.current().firstHand());
        textMorph.setSelectionRange(index, index + string.length);
    }
},
'debugging', {
    showsParserErrors: function() {
        return this.debugMode;
    },
    turnParserErrorsOff: function() { this.debugMode = false },
    turnParserErrorsOn: function() { this.debugMode = true }

});

lively.morphic.Panel.subclass('lively.ide.BrowserPanel',
'serialization', {

    onDeserialize: function($super) {
        var widget = new this.ownerWidget.constructor(),
            selection = this.getSelectionSpec();
        if (this.targetURL) widget.targetURL = this.targetURL;
        this.owner.targetMorph = this.owner.addMorph(widget.buildView(this.getExtent()));
        this.owner.targetMorph.setPosition(this.getPosition());
        this.remove();
        this.resetSelection(selection, widget);
    }

},
'accessing', {

    getPane: function(pane) { return this[pane] && this[pane].innerMorph() },

    getSelectionTextOfPane: function(pane) {
        pane = this.getPane(pane);
        if (!pane) return null;
        var index = pane.selectedLineNo;
        if (index === undefined) return null;
        var textItem = pane.submorphs[index];
        return textItem && textItem.textString;
    },

    getSelectionSpec: function() {
        var basicPaneName = 'Pane', spec = {}, i = 1;
        while (1) {
            var paneName = basicPaneName + i;
            var sel = this.getSelectionTextOfPane(paneName);
            if (!sel) return spec;
            spec[paneName] = sel;
            i++;
        }
    },

    resetSelection: function(selectionSpec, widget) {
        for (var paneName in selectionSpec)
            widget.inPaneSelectNodeNamed(paneName, selectionSpec[paneName]);
    }

},
'shutdown', {
    onShutdown: function($super) {
        var browser = this.ownerWidget;
        if (!browser.stop) {
            console.log('cannot unregister browser: ' + browser);
            return;
        }
        console.log('unregister browser: ' + browser);
        browser.stop();
    }
},
'events', {

    onWindowGetsFocus: function() {
        this.sourcePane && this.sourcePane.focus();
    },

    onKeyDown: function(evt) {
        // Command-U / Control-U to reset the souce view
        if (evt.isCommandKey() && evt.getKeyChar().toLowerCase() === 'u') {
            var browser = this.ownerWidget, node = browser.selectedNode();
            browser.ensureSourceNotAccidentlyDeleted(function() {
                browser.allChanged(false, node);
                browser.setStatusMessage('resetting ' + node.getName());
            });
            evt.stop(); return true;
        }
        if (this.navigateBrowserPanes(evt)) { evt.stop(); return true; }
        return false;
    },
    navigateBrowserPanes: function(evt) {
        var evtString = Event.pressedKeyString(evt),
            functionKeyMatch = evtString.match(/^F([1-6])/),
            altKeyMatch = evtString.match(/^Alt-(Left|Right|Up|Down)/);
        if (!functionKeyMatch && !altKeyMatch) return false;
        // alt+1..5 to select panels via keybord
        var self = this, browser = self.ownerWidget;
        function getPaneName() {
            // alt+1..5 to select panels
            var keyPaneMapping = {
                '1': 'Pane1','2': 'Pane2','3': 'Pane3','4': 'Pane4', '5': 'sourcePane', '6': 'locationPane'
            }
            if (functionKeyMatch) return keyPaneMapping[functionKeyMatch[1]];
            // Alt + Arrow keys
            if (!altKeyMatch[1]) return null;
            evt[altKeyMatch[1].toLowerCase()] = true;
            var paneNames = Object.values(keyPaneMapping),
                panes = paneNames.map(function(pane) { return self.getPane(pane); }),
                currentPane = paneNames.detect(function(pane, i) { return panes[i].isFocused(); }),
                i = Number(Properties.nameFor(keyPaneMapping, currentPane));
            if (i === undefined) return null;
            if (currentPane === 'locationPane') {
                if (evt.down) for (var j = 4; j > 0; j--) if (browser[paneNames[j-1] + "Selection"]) return keyPaneMapping[j];
                return null;
            }
            if (currentPane === "sourcePane") {
                // up: only from sourcePane, select list with selection, from right
                if (evt.up) for (var j = 4; j > 0; j--) if (browser[paneNames[j-1] + "Selection"]) return keyPaneMapping[j];
                return null;
            }
            if (evt.down) { return keyPaneMapping[5]; }
            if (evt.up) { return keyPaneMapping[6]; }
            if (evt.left) { return keyPaneMapping[i-1] || keyPaneMapping[6]; }
            if (evt.right) { return keyPaneMapping[i+1]; }
            return null;
        }
        function selectPane(paneName) {
            var pane = self.getPane(paneName)
            if (!pane) return false;
            pane.focus();
            var sel = paneName + "Selection";
            if (browser['set' + sel]) browser['set' + sel](pane.selection);
            return true;
        }
        return selectPane(getPaneName());
    },

    onOwnerChanged: function(newOwner) {
        if (!newOwner || !newOwner.isWindow || !this.ownerWidget) return;
        this.ownerWidget.updateTitle();
    }

});

Object.subclass('lively.ide.BrowserNode',
'documentation', {
    documentation: 'Abstract node, defining the node interface',
},
'initializing', {
    initialize: function(target, browser, parent) {
        this.target = target;
        this.browser = browser;
        this.parent = parent;
    },
},
'accessing', {
    siblingNodes: function() { return this.browser.nodesInSamePaneAs(this).without(this) },
    nextNode: function() {
        var nodes = this.browser.nodesInSamePaneAs(this);
        return nodes[nodes.indexOf(this) + 1];
    },
    parent: function() { return this.parent },
    childNodes: function() { return [] },
    sourceString: function() { return this.browser.emptyText }
},
'conversion', {
    asString: function() { return 'no name for node of type ' + this.constructor.type },
    asListItem: function() {
        //FIXME make class listitem
        var node = this;
        return {
            isListItem: true,
            string: this.asString(),
            value: this,
            onDrop: function(item) { node.onDrop( item && item.value) },    //convert to node
            onDrag: function() { node.onDrag() },
        };
    },
},
'testing', {
    hasSimilarTarget: function(other) {
        if (!other)
            return false;
        var myString = this.asString();
        var otherString = other.asString();
        return myString.length >= otherString.length ?
        myString.include(otherString) :
        otherString.include(myString);
    },
},
'source code management', {
    newSource: function(newSource) {
        var errorOccurred = false,
            failureOccurred = false,
            msg = 'Saving ' + this.target.getName() + '...\n',
            srcCtrl = this.target.getSourceControl ? this.target.getSourceControl() : lively.ide.SourceControl;

        // save source
        try {
            if (this.saveSource(newSource, srcCtrl)) {
                msg += 'Successfully saved';
            } else {
                msg += 'Couldn\'t save';
                failureOccurred = true;
            }
        } catch(e) {
            dbgOn(true)
            msg += 'Error while saving: ' + e;
            errorOccurred = true;
        }

        msg += '\n';

        // eval source
        try {
            if (this.browser.evaluate && this.evalSource(newSource)) {
                msg += 'Successfully evaluated ' + this.target.getName();
            } else {
                msg += 'Eval disabled for ' + this.target.getName();
                failureOccurred = true;
            }
        } catch(e) {
            msg += 'Error evaluating ' + e;
            // TODO don't reference UI directly?
            this.browser.panel.sourcePane.innerMorph().showError(e)
            errorOccurred = true;
        }
        var color = errorOccurred ? Color.red : (failureOccurred ? Color.black : Color.green);
        var delay = errorOccurred ? 5 : null;
        this.statusMessage(msg, color, delay);
        this.browser.signalNewSource(this);
    },
    evalSource: function(newSource) { return false },
    saveSource: function(newSource, sourceControl) { return false },
},
'menu', {
    menuSpec: function() { return [] },
},
'logging and feedback', {
    statusMessage: function(string, optColor, optDelay) {
        console.log('Browser statusMessage: ' + string);
        this.browser && this.browser.setStatusMessage(string, optColor, optDelay);
    },
},
'updating', {
    signalChange: function() { this.browser.nodeChanged(this) },
    signalTextChange: function() { this.browser.textChanged(this) },
    onSelect: function() {
        var codeEditor = this.browser.sourceInput();
        if (codeEditor.isCodeEditor) codeEditor.setTextMode(this.getSourceCodeMode());
    },
    getSourceCodeMode: function() { return 'javascript' },

},
'dragging and dropping', {
    onDrag: function() { console.log(this.asString() + 'was dragged') },
    onDrop: function(nodeDroppedOntoOrNull) { console.log(this.asString() + 'was dropped') },
    handleDrop: function(nodeDroppedOntoMe) {
        // for double dispatch
        return false;
    },
},
'file framgent support -- FIXME', {
    mergeFileFragment: function(fileFragment) {
        // for a node that represents multiple FileFragments
        return false
    },
});

Object.subclass('lively.ide.BrowserCommand', {

    initialize: function(browser) { this.browser = browser },

    wantsButton: Functions.False,

    wantsMenu: Functions.False,

    isActive: Functions.False,

    asString: function() { return 'unnamed command' },

    trigger: function() {},

    world: function() { return lively.morphic.World.current() },

});

Object.subclass('lively.ide.NodeFilter', {
    apply: function(nodes) { return nodes }
});

lively.ide.NodeFilter.subclass('lively.ide.SortFilter', {
    apply: function(nodes) {
        return nodes.sort(function(a,b) {
            if (a.asString().toLowerCase() < b.asString().toLowerCase()) return -1;
            if (a.asString().toLowerCase() > b.asString().toLowerCase()) return 1;
            return 0;
        });
    }
});

lively.ide.NodeFilter.subclass('lively.ide.NodeTypeFilter', {

    documentation: 'allows only nodes of the specified class',
    isNodeTypeFilter: true,

    initialize: function(attrsThatShouldBeTrue) {
        this.attributes = attrsThatShouldBeTrue;
    },

    apply: function(nodes) {
        var attrs = this.attributes;
        if (!attrs) {
            console.log('nodeTypeFilter has no attributes!!!');
            return nodes;
        }
        return nodes.select(function(node) {
            return attrs.any(function(attr) { return node[attr] });
        });
    }
});

Object.extend(lively.ide.NodeTypeFilter, {
    defaultInstance: function() {
        return new lively.ide.NodeTypeFilter([
            'isClassNode',
            'isGrammarNode',
            'isChangeNode',
            'isFunctionNode',
            'isObjectNode']);
    }
});

}) // end of module
