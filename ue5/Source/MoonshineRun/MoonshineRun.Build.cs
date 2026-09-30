using UnrealBuildTool;

public class MoonshineRun : ModuleRules
{
	public MoonshineRun(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core", "CoreUObject", "Engine", "InputCore",
			"ChaosVehicles", "PhysicsCore",                    // the trucks and sedans
			"EnhancedInput",                                   // keyboard / gamepad bindings
			"AIModule", "GameplayTasks", "NavigationSystem",   // pursuers and Behavior Trees
			"UMG", "Slate", "SlateCore",                       // menus and HUD widgets
		});
	}
}
