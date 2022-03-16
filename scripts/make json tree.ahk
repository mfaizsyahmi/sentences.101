; this script builds the directory list json used by sentences.101
; basically the directory tree of the sound/ folder in nested json array form.
;
; requires AutoHotKey to run (https://www.autohotkey.com/)
; REQUIRES JSON.ahk (https://github.com/cocobelgica/AutoHotkey-JSON)
; download and drop the JSON.ahk together with this file, 
; or in one of the library folders
; (ref: https://www.autohotkey.com/docs/Functions.htm#lib)
;
; HOW TO USE
; 1. Run the script with arguments: `path1 path2 ... pathN`
;    where each path is the path to the sound folder of a game/mod.
;    Alternatively, drag and drop those folders onto this script's icon in Explorer.
; 2. A paths.json file will be created in each of the folders, or you will be prompted 
;    for a name if a file of that name already exists.
; 3. Add the path to the created JSON file in gameCfg.json as <cfg>.listPath

#NoEnv  ; Recommended for performance and compatibility with future AutoHotkey releases.
; #Warn  ; Enable warnings to assist with detecting common errors.
SendMode Input  ; Recommended for new scripts due to its superior speed and reliability.
SetWorkingDir %A_ScriptDir%  ; Ensures a consistent starting directory.
#INCLUDE JSON.ahk

defaultFileName := "paths.json"

listFiles(path) {
	result := []
	loop, files, %path%\*, FD
	{
		name := A_loopFileName
		size := A_LoopFileSize
		
		if (FileExist(A_LoopFilePath) ~= "D")
			result.Push([name, listFiles(A_LoopFilePath)])
		else if (A_LoopFileExt ~= "i)wav")
			result.Push([name, size])
			
	}
	return result
}

getOutFilenameInter(path, firstChoice) {
	outFile := path "\" firstChoice

	While FileExist(outFile) {
		MsgBox, 3, , 
		(LTrim
			%outFile% 
			
			File already exists. Overwrite it?
		)
		IfMsgBox Cancel
			Return
		IfMsgBox No
			FileSelectFile, outFile, S, % path, Output File for %path%, JSON Document (*.json)
	}
	return outFile
}

processPath(path, outNameFirst) {
	outFile := getOutFilenameInter(path, outNameFirst)
	If !outFile
		Return
	
	result := listFiles(path)

	f := FileOpen(outFile, "w")
	f.write(JSON.dump(result))
	f.close()

	return outFile
}

showHelp() {
	HelpTextRaw = 
	(
Usage:
	"{}" path1 path2 ... pathN
Where:
	path1 ... pathN : sound folders of goldsrc games/mods

Or just drop the folders onto this script/program's icon in Explorer.
	)
	MsgBox % Format(HelpTextRaw, A_ScriptName)
}

main(args) {
	GLOBAL defaultFileName

	if (!args.length()) {
		showHelp()
		ExitApp
	}

	outFileList := ""
	for _, arg in args {
		If !FileExist(arg) ~= "D"
			Continue
		Loop, Files, %arg%, D
			thisPathInFull := A_LoopFileLongPath
		thisOutput := processPath(thisPathInFull, defaultFileName)
		if thisOutput
			outputList .= "`t" thisOutput "`n"
	}

	If StrLen(outFileList)
		MsgBox, 
		(
File(s) created:
%outFileList%
		)
}

main(A_Args)

Return ; END OF PROGRAM