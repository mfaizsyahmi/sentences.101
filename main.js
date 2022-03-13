/**
 * @typedef DirArrayItem
 * @type {[name: string, sizeOrContent: number|DirArrayItem[]]}
 */
/**
 * @typedef {Object} GameCfg
 * @prop {string} id unique game/mod name. use the game/mod folder name
 * @prop {string} name name of game/mod
 * @prop {string} soundPath relative path to sound folder for the particular game
 * @prop {string} listPath relative path to file containing the game/mod's sound folder dirArray
 * @prop {boolean} [required] mark base game that can't be unselected (i.e. "valve")
 * @prop {DirArrayItem[]} [dirArray]   holds directory list array at runtime
 * @prop {FolderView} [folderView]     reference to associated FolderView at runtime
 * @prop {TextView} [sentencesTxtView] reference to associated TextView at runtime 
 */

/**
 * load game cfgs, which loads their dirArrays
 * @param {Object} [options]
 * @param {string} [options.cfgfile] path to file containing gameCfg array json
 * @returns {GameCfg[]} gameCfg array
 */
async function loadGameCfgs(options = {}) {
    const settings = Object.assign({
        cfgfile : "gameCfg.json"
    }, options);

    // load the sound path config
    const result = await fetch(settings.cfgfile);
    const gameCfg = await result.json();

    // load the sound dirArray
    const pathFilesLoad = await Promise.allSettled(
        gameCfg.map(cfg => fetch(cfg.listPath))
    );
    const jsonValues = await Promise.allSettled(
        pathFilesLoad.map(async (r, i) => {
            gameCfg[i].dirArrayLoaded = (r.value.ok);
            if (r.value.ok) {
                return r.value.json()
            }
            return 0;
        })
    );
    console.log(jsonValues);   
    jsonValues.forEach((r, i) => gameCfg[i].dirArray = r.value)

    return gameCfg;
}

/**
 * Takes the GameCfg array and creates:
 * - game selection in the left sidebar/drop menu
 * - file view for each game/mod
 * - sentences.txt text view for each game/mod
 * @param {GameCfg[]} gameCfg 
 * @param {Object} [options]
 * @param {string} [options.gameSelectSelector]  selector for game select container in sidebar
 * @param {string} [options.filePathSelector]    selector for file view tab container
 * @param {string} [options.fileBrowserSelector] selector for file view container
 * @param {string} [options.txtFileSelector]     selector for sentences.txt text view container
 */
async function populateGames(gameCfg, options = {}) {
    const settings = Object.assign({
        gameSelectSelector  : "#sound-paths",
        filePathSelector    : "#filePathList",
        fileBrowserSelector : "#filebrowser-container",
        txtFileSelector     : "#section-txt"
    }, options);

    // load local settings
    const localSettings = JSON.parse(localStorage["settings"]?.selectedGames ?? "[]"),
    wordWrap = readSettings().txtWordWrap;

    // create document fragment and get references to all the containers
    const fragment = document.createDocumentFragment(),
    gameSelectContainer = document.querySelector(settings.gameSelectSelector),
    filePathContainer = document.querySelector(settings.filePathSelector),
    fileBrowserContainer = document.querySelector(settings.fileBrowserSelector),
    txtFilecontainer = document.querySelector(settings.txtFileSelector),
    sentencesTextArea = document.querySelector("#sentences");

    // game config list
    fragment.append(...gameCfg.map(cfg => {
        /* // doesn't work for some reason
        return qEl("li", "", {},
            qEl("label", "", {},
                qEl("input", "", {
                    type:  "checkbox",
                    id:    "selectedGames",
                    value: cfg.id,
                    required: cfg.required, 
                    checked: cfg.required || localSettings.includes(cfg.id),
                    readonly: cfg.required || !cfg.dirArrayLoaded,
                    disabled: (!cfg.dirArrayLoaded)
                }),
                " " + cfg.name
            )
        );
        */
        const li = document.createElement("li")
        li.innerHTML = `<label class="${(!cfg.dirArrayLoaded) ? 'text-gray-400': ''}">
            <input type="checkbox" name="selectedGames[]" value="${cfg.id}" 
            ${cfg.required ? "required " : " "}
            ${(cfg.required || localSettings.includes(cfg.id)) ? "checked " : " "}
            ${(cfg.required || !cfg.dirArrayLoaded) ? "readonly " : " "}
            ${(!cfg.dirArrayLoaded) ? "disabled " : " "}
            > ${cfg.name}</label>`;
        return li;
    }));
    gameSelectContainer.append(fragment);
    
    // file tabs
    fragment.append(...gameCfg.map((cfg, i) => {
        return qEl("li", 
            ((cfg.required || localSettings.includes(cfg.soundPath))
                ? ""
                : "hidden") + 
            ((!i) ? " active" : ""), 
            {dataset: {id: cfg.id}},
            qEl("a", "", {dataset: {id: cfg.id}},
                `${cfg.id}/sound`
            )
        )
    }));
    filePathContainer.append(fragment);

    gameCfg.forEach( cfg => {
        if (!cfg.dirArrayLoaded) return;

        // folder views
        cfg.folderView = new FolderView(fileBrowserContainer, cfg);

        // sentences.txt view
        cfg.sentencesTxtView = new TextView(txtFilecontainer, {
            loadFile: cfg.soundPath + "sentences.txt",
            lazyLoad: true,
            wordWrap,
            targetEl: sentencesTextArea
        });
    });

    
    // show first folderview
    gameCfg.some(cfg => {
        cfg.folderView?.show();
        cfg.sentencesTxtView?.show();
        return cfg.folderView;
    });
    
    // event listeners
    // game select
    gameSelectContainer.querySelectorAll(`input`).forEach(el => {
        el.addEventListener("input", doUpdateSettings);
    });
    // file tab
    filePathContainer.querySelectorAll("a").forEach(el => {
        el.addEventListener("click", e => {
            const thisId = e.currentTarget.dataset.id;
            gameCfg.forEach(cfg => {
                if (cfg.id === thisId) {
                    cfg.folderView?.show();
                    cfg.sentencesTxtView?.show();
                } else {
                    cfg.folderView?.hide();
                    cfg.sentencesTxtView?.hide();
                }
            });
            Array.from(el.parentNode.parentNode.children)
            .forEach(item => item.classList.toggle("active", item.dataset.id === thisId));
        });
    });
}
let gameCfg;
loadGameCfgs()
.then(result => {
    gameCfg = result;
    populateGames(gameCfg);
});

// sidebar settings
function parseFormData(selector) {
    const fd = new FormData(document.querySelector(selector)),
    result = {};
    fd.forEach((v, k) => {
        result[k] 
            ? result[k].push(v) 
            : result[k] = [v]
    });
    return result;
}
function readSettings() {
    return parseFormData("#sidebar-settings");
}
function doUpdateSettings(e) {
    if (e.currentTarget.readOnly)
        e.currentTarget.checked = true;

    const settings = readSettings();

    // unused atm
    // localStorage["settings"] = JSON.stringify(currentSettings);

    // word-wrap
    const wordWrap = settings.txtWordWrap;
    
    // go through selected games to update vox and show/hide file tabs
    const selectedGames = settings["selectedGames[]"] ?? [],
    soundPaths = [];
    gameCfg.forEach(cfg => {
        if (selectedGames.includes(cfg.id)) {
            soundPaths.push(cfg.soundPath);
        }
        document.querySelector(`#filePathList li[data-id="${cfg.id}"]`)
            .classList.toggle("hidden", !(cfg.dirArrayLoaded && selectedGames.includes(cfg.id)));

        // word wrap
        if (cfg.sentencesTxtView)
            cfg.sentencesTxtView.wordWrap = wordWrap;
    });
    
    // update vox's soundPaths
    if (vox) vox.soundPaths = soundPaths;
    // switch to first tab of file browser
    document.querySelector(`#filePathList li:first-child`).click()

}

document.querySelectorAll("#sidebar-settings input").forEach(el => {
    el.addEventListener("input", doUpdateSettings);
});

// initialize vox
const vox = new VOXSpeaker();
vox.addEventListener("medialoading", _ => {
    document.querySelector("#loading-icon").classList.remove("hidden");
});
vox.addEventListener("medialoaded", _ => {
    document.querySelector("#loading-icon").classList.add("hidden");
});
vox.addEventListener("speakstart", _ => {
    document.querySelector("#speak-icon").classList.remove("hidden");
});
vox.addEventListener("speakend", _ => {
    document.querySelector("#speak-icon").classList.add("hidden");
});
vox.volume = document.querySelector("#vol").value;

// init history view
const speakHistory = new SentenceHistory(
    document.querySelector("#history"),
    document.querySelector("#sentences")
);

document.querySelector("#sentences").focus();

// ui toggles
const toggleCSSclasses = (el, ...cls) => cls.map(cl => el.classList.toggle(cl))
document.querySelectorAll("[data-act='toggle'], [data-act='toggle'] + h2").forEach(el => {
    el.addEventListener("click", e => {
        toggleCSSclasses(el.parentNode.parentNode, "section-collapsed");
    });
})

function doSpeak(e) {
    e.preventDefault();
    const sentence = e.currentTarget.elements.sentences.value;
    vox.speak(sentence);
    if (readSettings().historyEnable)
        speakHistory.add(sentence);
}
function doStop(e) {
    vox.stop();
}
function doAdjustVolume(e) {
    vox.volume = e.currentTarget.value
}
function doClearAudioCache(e) {
    e.preventDefault();
    vox.clearAudioCache();
}

function doAddHistory() {
    speakHistory.add(document.querySelector("#sentences").value);
}
function doClearHistory() {
    const really = confirm("Do you really want to clear your speak history?")
    if (!really) return;

    speakHistory.clear();
}

// play/stop preview
// called by FolderView list items
function playPreview(src) {
    const el = document.querySelector("#audioPreview");
    el.src = src;
    el.play();
    document.querySelector("#previewing").classList.remove("hidden");
}
function stopPreview() {
    document.querySelector("#audioPreview").pause();
    document.querySelector("#previewing").classList.add("hidden");
}
