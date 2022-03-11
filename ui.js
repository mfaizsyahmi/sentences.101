// REQUIRES handlebars.js

/**
 * Quick element maker
 * @param {string} name     Element nodeName
 * @param {string} classes  Element className
 * @param {Object} attrs    keyvalues -> element attributes
 * @param {Object} [attrs.dataset] keyvalues -> element dataset
 * @param {Object} [attrs.class] keyvalues -> element style
 * @param {string} [attrs.class] apply element style directly
 * @param {...HTMLElement|string} content   elements to append()
 * @returns {HTMLElement} the created element
 */
function qEl(name, classes = "", attrs = {}, ...content) {
    const el = document.createElement(name);
    el.className = classes;
    Object.entries(attrs).forEach(kv => {
        if (['dataset', 'style'].includes(kv[0]) && kv[1] instanceof Object) {
            Object.entries(kv[1]).forEach(datakv => {
                el[kv[0]][datakv[0]] = datakv[1]
            });
        } else {
            el[kv[0]] = [kv[1]];
        }
    });
    el.append(...content);

    return el;
}

/**
 * quick icon maker, ready to be appended
 * @param {string} name icon ID
 * @param {string} activeName icon ID for "active" state (check CSS for implementation
 * @returns {DocumentFragment} document fragment containing the DOM element
 */
function createIconFragment(name, activeName=null) {
    activeName = activeName ?? name;
    const template = Handlebars.compile(`
    <svg class="icon stroke-current" viewBox="0 0 16 16">
        <use class="normal" xlink:href="#{{name}}"/>
        <use class="active" xlink:href="#{{activeName}}"/>
    </svg>`),
    fragment = document.createDocumentFragment(),
    dummy = document.createElement("i");
    dummy.innerHTML = template({ name, activeName });
    fragment.append(...dummy.childNodes);
    return fragment;
}

/** Manages sentence history
 * @requires Handlebars
 * @prop {Element} container DOM container for sentence history
 */
class SentenceHistory {
    localStorageProp = "sentence-history";
    defaultTemplateSelector = "#sentence-history-template"

    /**
     * @param {Element} container where the history list DOM will be constructed
     * @param {HTMLTextAreaElement} target text area to read/write values from/to
     * @param {Object} [options]
     * @param {number} [options.maxEntries]
     * @param {string} [options.templateSelector]
     */
    constructor(container, target, options = {}) {
        if (!container instanceof Element)
            throw TypeError("container must be an element")
        /**
         * HTML Element to populate the history
         * @type {Element}
         * @public
         */
        this.container = container;

        if (!target instanceof HTMLTextAreaElement)
            throw TypeError("target must be a textarea element")
        /**
         * TextArea element to read/write sentence from/to
         * @type {HTMLTextAreaElement}
         * @public
         */
        this.target = target;
        
        /**
         * maximum number of entries before we start clearing old ones
         * @type {number}
         * @public
         */
        this.maxEntries = options?.maxEntries ?? 50;
        /**
         * a querySelector string pointing to an element whose contents we will
         * use as template for history item instance in DOM
         * @type {string}
         */
        this.templateSelector = options?.templateSelector 
            ?? this.defaultTemplateSelector;
        /**
         * compiled Handlebar template from the element defined in 
         * this.templateSelector
         * @type {Function}
         */
        this.template = Handlebars
            .compile(document.querySelector(this.templateSelector).innerHTML);

        /**
         * stores the history entries 
         * @type {Object[]}
         */
        this.entries = this.loadFromStorage()
        .map(el => {return {text: el}});
        this.domAddEntries(this.entries);
    }

    /**
     * Event handler for DOM entries
     * @param {MouseEvent} e 
     * @param {SentenceHistory} inst 
     */
    domEntryClick(e, inst) {
        const whichEl = e.target,
        entryRef = inst.entries.find(item => item.el === e.currentTarget) ?? null;

        // no associated history entry found
        if (!entryRef) {
            //e.currentTarget.remove()
            console.log("missing ref... how did we got here?", e.currentTarget);

        } 
        // double click on DOM entry -> insert to textarea
        else if (e.type == "dblclick" && e.target === e.currentTarget) {
            inst.target.value = entryRef.text;
            this.mru(entryRef);
            
        } 
        // clicked insert button
        else if (whichEl.dataset.act === "insert") {
            inst.target.value = entryRef.text;
            this.mru(entryRef);

        } 
        // clicked remove button
        else if (whichEl.dataset.act === "remove") {
            inst.remove(entryRef.text);
        }
    }

    /**
     * puts the entry to the top (i.e. to end of this.entries array)
     * @param {Object} entry the entry object
     */
    mru(entry) {
        const idx = this.entries.indexOf(entry);
        if (idx === -1) return;

        const removed = this.entries.splice(idx, 1);
        this.entries.push(...removed);

        this.container.insertBefore(entry.el, this.container.firstChild);
    }

    /**
     * populate given container with DOM elements representing the entries
     * @param {Object} entries 
     * @param {Element} targetEl 
     */
    domAddEntries(entries, targetEl=this.container) {
        const fragment = new DocumentFragment(),
        dummy = document.createElement("div");
        entries.forEach(entry => {
            if (entry.el) return;

            dummy.innerHTML = this.template(entry); // instantiate handlebar template
            entry.el = dummy.firstElementChild;
            fragment.prepend(dummy.firstElementChild); 
        });
        
        // must add element to DOM first before adding event listener
        targetEl.insertBefore(fragment, this.container.firstChild);

        entries.forEach(entry => {
            entry.el.addEventListener("click", e => { 
                this.domEntryClick(e, this)
            });
            entry.el.addEventListener("dblclick", e => { 
                this.domEntryClick(e, this)
            });
        });

    }

    /**
     * Check if history has the given string
     * @param {string} str string to find
     * @returns 
     */
    has(str) {
        return this.entries.find(entry => entry.text === str)
    }

    add(str) {
        if (this.has(str)) return;
        
        const newEntry = {text: str};
        this.entries.push(newEntry);
        this.domAddEntries([newEntry]);

        if (this.entries.length > this.maxEntries) {
            this.remove(this.entries.shift().text);
        }

        this.saveToStorage(this.entries);
    }

    remove(str) {
        if (!this.has(str)) return;

        const index = this.entries.findIndex(entry => entry.text === str),
        doomedEntry = this.entries.splice(index, 1)[0];
        doomedEntry.el.remove(); // element commit remove
        
        this.saveToStorage(this.entries);
    }

    clear() {
        this.entries.forEach(entry => {
            entry.el.remove();
        });
        this.entries = [];
        
        this.saveToStorage(this.entries);
    }

    // loading from and saving to local storage
    saveToStorage(entries) {
        localStorage[this.localStorageProp] = JSON
            .stringify(entries.map(entry => entry.text));
    }
    loadFromStorage() {
        return JSON.parse(localStorage[this.localStorageProp] ?? "[]" ) ?? [];
    }
}

class FolderView {
    constructor(container, cfg) {
        this.container = container;
        this.cfg = cfg;
        this.dirArray = this.cfg.dirArray;
        
        // create the DOM elements //

        // logical tree el
        this.tree = qEl("ul", "root", {},
            qEl("li", "folder", {}, 
                qEl("a", "truncate active", { dataset: {
                        path: ""
                    }}, 
                    createIconFragment("folder"),
                    "sound"
                ),
                this.loadTree(qEl("ul", "", {}), this.dirArray)
            )
        );

        // logical list el
        this.list = qEl("ul", "", {});
        this.loadList(this.list, this.dirArray);

        // the layout elements
        this.el = qEl("div",
            `h-full overflow-hidden grid grid-cols-12 gap-2 lg:gap-0
            border border-gray-700 hidden`, 
            {},
            qEl("div",
                `treeview col-span-6 sm:col-span-4 lg:col-span-3 
                h-full overflow-auto p-2 lg:border-r lg:border-gray-700`, 
                {},
                this.tree
            ),
            qEl("div",
                `listview col-span-6 sm:col-span-8 lg:col-span-9 
                h-full overflow-auto p-2`, 
                {style: "column-width: 7rem"},
                this.list
            )
        );
        this.container.append(this.el);

        // bind event handlers
        this.tree.onclick = e => this.treeClick(e, this);
        this.list.onclick = e => this.listClick(e, this);
    }

    /**
     * Unified function to create and populate TreeView list items
     * @param {String} name                name of item
     * @param {("file"|"folder")} type     type of item
     * @param {Array.<number>} path        path of this item in the dirArray
     * @param  {...Element|String} content DOM content
     * @returns {HTMLLIElement}            created LI element
     */
    _makeLi(name, type, path, ...content) {
        return qEl("li", `${type} truncate`, {}, 
            qEl("a", "", { 
                    title: name,
                    href: this.getNamedPath(this.dirArray, path),
                    dataset: { path: path.join(",") }
                }, 
                createIconFragment(type),
                name
            ),
            ...content
        );
    }

    /** 
     * populates a UL with a directory tree 
     * @param {HTMLUlElement} el    the target element
     * @param {Array} dirTree       the whole directory tree
     * @param {Array.<number>} path path of the directory tree to the current item
     *                              (called only by recursion)
     * @returns {HTMLUlElement} the first param so we can slot this in qEl
     */
    loadTree(el, dirTree, path=[]) {
        const fragment = document.createDocumentFragment();
        dirTree.forEach((item, index) => {
            if (!Array.isArray(item[1]))
                return;

            const li = this._makeLi(item[0], "folder", [...path, index],
                (item[1].length) 
                    ? this.loadTree(qEl("ul"), item[1], [...path, index])
                    : ""
            );

            fragment.append(li);
        });
        el.append(fragment);

        return el;
    }

    /** 
     * populates a UL with a directory list (1 level only)
     * @param {HTMLUlElement} el    the target element
     * @param {Array} dirArr        the whole directory tree
     * @param {Array.<number>} path path of the directory tree to the current item
     * @returns {HTMLUlElement} the first param so we can slot this in qEl
     */
    loadList(el, dirArr, path=[]) {
        const fragment = document.createDocumentFragment();

        fragment.append( 
            // up one level item
            (path.length && !isNaN(path[0]))
                ? this._makeLi("..", "folder", path.slice(0, -1))
                : "",

            // directory contents
            ...dirArr.map((item, index) => this._makeLi(
                item[0],
                (Array.isArray(item[1])) ? "folder": "file",
                [...path, index]
            ))
        );

        el.append(fragment);

        return el;
    }
    
    /**
     * Traverse a tree by the given path indices array
     * @param {Array} tree          tree structure to navigate
     * @param {Array.<number>} path array of indices to traverse
     * @returns {Array|undefined} item from tree if path is valid,
     *                            otherwise undefined
     */
    traverse(tree, path) {
        // root ("" => [""] => [NaN])
        if (path.length === 1 && isNaN(path[0]))
            return tree;
        
        let branch = tree;
        path.every(idx => {
            branch = branch[idx]?.[1] ?? undefined;
            return branch;
        });
        return branch;
    }

    /**
     * Traverse a tree by the given path indices array
     * and returns the named path
     * @param {Array} tree          tree structure to navigate
     * @param {Array.<number>} path array of indices to traverse
     * @returns {String|undefined} name path if path is valid,
     *                             otherwise undefined
     */
    getNamedPath(tree, path) {
        const pathNames = [];
        let branch = tree;
        path.every(idx => {
            pathNames.push(branch[idx]?.[0]);
            branch = branch[idx]?.[1] ?? undefined;
            return branch;
        });
        return this.cfg.soundPath + pathNames.join("/");
    }
    
    treeClick(e, inst) { //'sphilip
        if (e.target.dataset.path === undefined) return;
        if (e.target.href) e.preventDefault();

        const path = e.target.dataset.path.split(",")
            .filter(el => el.length).map(el => parseInt(el));

        inst.navigate(path);
    }

    listClick(e, inst) {
        if (e.target.dataset.path === undefined) return;
        if (e.target.href) e.preventDefault();

        const path = e.target.dataset.path.split(",")
            .filter(el => el.length).map(el => parseInt(el)),
        dirItem = inst.traverse(inst.dirArray, path);
    
        if (Array.isArray(dirItem[1])) {
            inst.navigate(path);
        } else if (readSettings().fileAutoPlay) {
            playPreview(e.target.href);
        }
    }

    navigate(path, dirArray = undefined) {
        this.list.replaceChildren();
        if (!dirArray)
            dirArray = this.traverse(this.dirArray, path);
        this.loadList(this.list, dirArray, path);

        // re-assign the active class in treeview
        this.tree.querySelectorAll(".active").forEach(item => {
            item.classList.remove("active");
        });
        for (let i=0, thisPath; i <= path.length; i++) {
            thisPath = path.slice(0, i);
            this.tree.querySelector(`[data-path="${thisPath.join(",")}"]`)
                ?.classList.add("active");
        }

        return this;
    }

    show() {
        this.el.classList.remove("hidden");
        return this;
    }
    
    hide() {
        this.el.classList.add("hidden");
        return this;
    }

}

class TextView {
    constructor(container, options = {}) {
        const settings = Object.assign({
            lazyLoad: false,
        }, options);

        this.container = container;

        this.textEl = qEl("pre", "absolute w-full h-fit p-2", {}, "// sentences.txt content here");
        this.markupEl = qEl("div", "markup absolute w-full h-fit p-2", {});
        this.el = qEl("div", "hidden textview w-full h-full relative overflow-auto", {}, this.markupEl, this.textEl);
        this.container.append(this.el);

        this._filePath = settings.loadFile;

        if (settings.loadFile && !settings.lazyLoad) {
            this.loadFile(settings.loadFile);
        }
    }

    async loadFile(filePath) {
        const textFile = await fetch(filePath);
        this.textContent = await textFile.text();
        // this escapes bespoke characters (not really)
        //const textNode = document.createTextNode(this.textContent);
        //this.textEl.append(textNode);
        this.textEl.textContent = this.textContent;
    }

    show() {
        if (!this.textContent && this._filePath) {
            this.loadFile(this._filePath)
        }
        this.el.classList.remove("hidden")
    }
    hide() {
        this.el.classList.add("hidden")
    }
}
