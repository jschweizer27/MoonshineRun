// ProhibitionCop.h — Dev Guide Phase 3
// AI pursuer (cop or Temperance Alliance zealot). Patrols, chases the player on
// detection, and gives up after losing them. Pair with a Behavior Tree asset.
// SKELETON: not compiled here.
#pragma once

#include "CoreMinimal.h"
#include "MoonshineVehicle.h"
#include "ProhibitionCop.generated.h"

UENUM(BlueprintType)
enum class EPursuerState : uint8
{
	Patrol,
	Chase,
	Searching
};

UCLASS()
class MOONSHINERUN_API AProhibitionCop : public AMoonshineVehicle
{
	GENERATED_BODY()

public:
	AProhibitionCop();

	// Distance at which the cop spots Otto.
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI")
	float DetectionRange = 4000.f;

	// Seconds out of sight before giving up the chase (Dev Guide: ~10s).
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI")
	float GiveUpTime = 10.f;

	// Visual/behavior variant: false = federal cop, true = zealot.
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI")
	bool bIsZealot = false;

	UPROPERTY(BlueprintReadOnly, Category = "AI")
	EPursuerState State = EPursuerState::Patrol;

protected:
	virtual void Tick(float DeltaSeconds) override;

	bool CanSeePlayer() const;
	void DriveToward(const FVector& Target, float DeltaSeconds);
};
