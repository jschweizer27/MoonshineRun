using UnrealBuildTool;

public class MoonshineRunTarget : TargetRules
{
	public MoonshineRunTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("MoonshineRun");
	}
}
