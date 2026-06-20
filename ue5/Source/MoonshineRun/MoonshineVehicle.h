// MoonshineVehicle.h — Dev Guide Phase 1
// Otto's retrofitted steeplechase trailer, built on the Chaos Vehicles plugin.
// SKELETON: not compiled here. Build in your UE5 project.
#pragma once

#include "CoreMinimal.h"
#include "WheeledVehiclePawn.h"
#include "MoonshineVehicle.generated.h"

class UCameraComponent;
class USpringArmComponent;
struct FInputActionValue;

UCLASS()
class MOONSHINERUN_API AMoonshineVehicle : public AWheeledVehiclePawn
{
	GENERATED_BODY()

public:
	AMoonshineVehicle();

protected:
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

	// Chase camera that trails the rig (mirrors the web demo's chase cam).
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Camera")
	USpringArmComponent* SpringArm;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Camera")
	UCameraComponent* ChaseCamera;

	// True while hauling shine — raises heat and flips pursuer behavior.
	UPROPERTY(BlueprintReadWrite, Category = "Smuggling")
	bool bCarryingCargo = false;

	// --- Input handlers (bind via Enhanced Input in cpp) ---
	void Throttle(float Value);   // W / Up
	void Brake(float Value);      // S / Down
	void Steer(float Value);      // A,D / Left,Right
};
