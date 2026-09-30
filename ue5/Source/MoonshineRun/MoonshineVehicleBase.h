// MoonshineVehicleBase.h: Dev Guide Phase 1. Shared by Otto's truck and the pursuers.
// A Chaos wheeled vehicle with one small driving API, so player input and the police AI
// drive through exactly the same physics.
//
// Give a Blueprint child a Skeletal Mesh that has a physics asset and wheel bones named
// Phys_Wheel_FL / FR / BL / BR, like the cars in UE's Vehicle template (CHECKLIST.md, step 4).
#pragma once

#include "CoreMinimal.h"
#include "WheeledVehiclePawn.h"
#include "MoonshineVehicleBase.generated.h"

class UChaosWheeledVehicleMovementComponent;

UCLASS(Abstract)
class MOONSHINERUN_API AMoonshineVehicleBase : public AWheeledVehiclePawn
{
	GENERATED_BODY()

public:
	AMoonshineVehicleBase();

	// Throttle and brake 0..1; steer -1 (left) .. 1 (right). Braking reverses once stopped.
	UFUNCTION(BlueprintCallable, Category = "Driving")
	void SetDriveInput(float Throttle, float Brake, float Steer, bool bHandbrake = false);

	// Signed speed along the vehicle's nose, cm/s (negative when reversing).
	UFUNCTION(BlueprintPure, Category = "Driving")
	float GetForwardSpeed() const;

	UFUNCTION(BlueprintPure, Category = "Driving")
	float GetSpeedMph() const;

	// Teleport upright to a spot and stop dead (after a bust, or when flipped).
	UFUNCTION(BlueprintCallable, Category = "Driving")
	void ResetTo(const FTransform& Where);

	UChaosWheeledVehicleMovementComponent* GetWheeledMovement() const;
};
