// ProhibitionCop.h: Dev Guide Phase 3. A pursuer car: a Prohibition Bureau Fed or a
// Temperance Alliance zealot. The pawn only holds settings; the brain is
// AProhibitionCopController, which runs the Behavior Tree below if one is set and the same
// logic in C++ if not, so cops work before you have built any AI assets.
//
// Make one Blueprint child per look (BP_FedSedan, BP_ZealotPickup), give each a mesh, and
// hand them to the delivery manager (CHECKLIST.md, step 5).
#pragma once

#include "CoreMinimal.h"
#include "MoonshineVehicleBase.h"
#include "ShineTuning.h"
#include "ShineTypes.h"
#include "ProhibitionCop.generated.h"

class UBehaviorTree;

UCLASS()
class MOONSHINERUN_API AProhibitionCop : public AMoonshineVehicleBase
{
	GENERATED_BODY()

public:
	AProhibitionCop();

	// Feds aim ahead to cut you off; zealots drive straight at you to ram.
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI")
	EPursuerKind Kind = EPursuerKind::Fed;

	// Optional. Leave empty to use the built-in C++ behaviour (it does the same thing).
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "AI")
	TObjectPtr<UBehaviorTree> BehaviorTree;

	// Top chase speed, cm/s. Patrols cruise at 40%, searches at 70%.
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI")
	float MaxSpeed = ShineTuning::CopMaxSpeed;

	// How far this cop can see Otto (with a clear line of sight).
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI")
	float SightRange = ShineTuning::SightRange;

	// Patrols see through the horse-box disguise only this close.
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI")
	float CloseRange = ShineTuning::CloseRange;

	// Seconds out of sight before this cop gives up and goes back to patrolling.
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI")
	float GiveUpTime = ShineTuning::GiveUpTime;

	// Hook for sirens, flashing lights or a torch-waving zealot in Blueprint.
	UFUNCTION(BlueprintImplementableEvent, Category = "AI")
	void OnModeChanged(EPursuerMode NewMode);
};
