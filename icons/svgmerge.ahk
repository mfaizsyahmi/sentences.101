#NoEnv  ; Recommended for performance and compatibility with future AutoHotkey releases.
; #Warn  ; Enable warnings to assist with detecting common errors.
SendMode Input  ; Recommended for new scripts due to its superior speed and reliability.
SetWorkingDir %A_ScriptDir%  ; Ensures a consistent starting directory.

filenameRE := "i)chevron-(up|down)|menu-hamburger|cog|file|folder|download|pencil|bin|github|link-external"
outPath := "select-icons.svg"

FileDelete, %outPath%
FileDelete, SVG.TEMP
FileAppend, <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" version="1.1">`n, SVG.TEMP

Loop, Files, *.svg
{
	if (A_LoopFileName = outPath || !A_LoopFileName ~= filenameRE)
		continue
		
	fixedName := StrReplace(A_LoopFileName, "-svgrepo-com.svg")
	; fixedName := "icon-" StrReplace(A_LoopFileName, "-svgrepo-com.svg")
	
	FileRead, svgContent, % A_LoopFilePath
	; svgContent := RegExReplace(svgContent, "\sviewBox="".*?""", "")
	svgContent := RegExReplace(svgContent, "\sxmlns="".*?""", "")
	svgContent := RegExReplace(svgContent, "\sversion="".*?""", "")
	svgContent := RegExReplace(svgContent, "<svg ", Format("<symbol id=""svg-{}"" ", fixedName))
	svgContent := RegExReplace(svgContent, "/svg", "/symbol")
	
	FileAppend, % svgContent "`n", SVG.TEMP
}

FileAppend, </svg>, SVG.TEMP
FileMove, SVG.TEMP, %outPath%, 1
