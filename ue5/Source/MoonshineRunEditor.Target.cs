using UnrealBuildTool;

public class MoonshineRunEditorTarget : TargetRules
{
	public MoonshineRunEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("MoonshineRun");
	}
}
