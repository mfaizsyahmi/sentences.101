; this script builds the directory list json used by sentences.101
; basically the directory tree of the sound/ folder in nested json array form.
;
; requires AutoHotKey to run (https://www.autohotkey.com/)
; REQUIRES JSON.ahk (https://github.com/cocobelgica/AutoHotkey-JSON)
; download and drop the JSON.ahk in one of the library folders
; (ref: https://www.autohotkey.com/docs/Functions.htm#lib)
;
; HOW TO USE
; 1. copy this file into the sound/ folder
; 2. double click to run. AHK must be installed properly for this to work.
;    if it runs successfully, a paths.json file will be created in the same place.
; 3. add the path to the file in gameCfg.json as <cfg>.listPath

#NoEnv  ; Recommended for performance and compatibility with future AutoHotkey releases.
; #Warn  ; Enable warnings to assist with detecting common errors.
SendMode Input  ; Recommended for new scripts due to its superior speed and reliability.
SetWorkingDir %A_ScriptDir%  ; Ensures a consistent starting directory.
#INCLUDE JSON.ahk

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

result := listFiles(A_ScriptDir)

FileDelete, paths.json
FileAppend, % JSON.dump(result), paths.json