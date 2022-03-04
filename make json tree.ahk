#NoEnv  ; Recommended for performance and compatibility with future AutoHotkey releases.
; #Warn  ; Enable warnings to assist with detecting common errors.
SendMode Input  ; Recommended for new scripts due to its superior speed and reliability.
SetWorkingDir %A_ScriptDir%  ; Ensures a consistent starting directory.
#INCLUDE D:\Fareast\Sh\Ahk_Lib\JSON.ahk

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