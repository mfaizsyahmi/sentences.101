// REQUIRES handlebars.js

// quick element creator
// @param {string} name    Element nodeName
// @param {string} classes Element className
// @param {Object} attrs   keyvalues -> element attributes
// @param {HTMLElement|string} ...content  elements to append()
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
// quick icon maker, ready to be appended
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

class SentenceHistory {
    localStorageProp = "sentence-history";
    defaultTemplateSelector = "#sentence-history-template"

    constructor(container, target, options = {}) {
        if (!container instanceof Element)
            throw TypeError("container must be an element")
        this.container = container;

        if (!target instanceof HTMLTextAreaElement)
            throw TypeError("target must be a textarea element")
        this.target = target;
        
        this.maxEntries = options?.maxEntries ?? 50;
        this.templateSelector = options?.templateSelector 
            ?? this.defaultTemplateSelector;
        this.template = Handlebars
            .compile(document.querySelector(this.templateSelector).innerHTML);

        this.entries = this.loadFromStorage()
        .map(el => {return {text: el}});
        this.domAddEntries(this.entries);
    }

    domEntryClick(e, inst) {
        const whichEl = e.target,
        entryRef = inst.entries.find(item => item.el === e.currentTarget) ?? null;

        if (!entryRef) {
            //e.currentTarget.remove()
            console.log("missing ref... how did we got here?", e.currentTarget);

        } else if (e.type == "dblclick" && e.target === e.currentTarget) {
            inst.target.value = entryRef.text;
            this.mru(entryRef);
            
        } else if (whichEl.dataset.act === "insert") {
            inst.target.value = entryRef.text;
            this.mru(entryRef);

        } else if (whichEl.dataset.act === "remove") {
            inst.remove(entryRef.text);
        }
    }

    // put the entry to the top (i.e. to end)
    mru(entry) {
        const idx = this.entries.indexOf(entry);
        if (idx === -1) return;

        const removed = this.entries.splice(idx, 1);
        this.entries.push(...removed);

        this.container.insertBefore(entry.el, this.container.firstChild);
    }

    domAddEntries(entries, targetEl=this.container) {
        const fragment = new DocumentFragment();
        entries.forEach(entry => {
            if (entry.el) return;

            const dummy = document.createElement("div");
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

    // got a lot of duplicate code that creates list item representing file/folder
    // so here's the extract
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

    // @desc  populates a UL with a list tree 
    // @param {HTMLUlElement} el    the target element
    // @param {Array} dirTree       a nested tree-like array
    // @param {Array} path          an array of paths for tree traversal
    //                              (called only by recursion)
    // @returns the first param so we can slot this in qEl
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
            /*
            const li = qEl("li", "folder", {}, 
                qEl("a", "truncate", { dataset: {
                        path: [...path, index].join(",")
                    }}, 
                    createIconFragment("folder"),
                    item[0]
                )
            );
            if (item[1].length) {
                const childUl = document.createElement("ul");
                this.loadTree(childUl, item[1], [...path, index]);
                li.append(childUl);
            }
            */

            fragment.append(li);
        });
        el.append(fragment);

        return el;
    }

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
