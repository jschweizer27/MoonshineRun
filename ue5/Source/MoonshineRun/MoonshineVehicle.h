// MoonshineVehicle.h: Dev Guide Phase 1. Otto's Model TT truck and steeplechase horse
// trailer, driven by the player: chase camera, Enhanced Input, cargo and the horse-box
// disguise.
//
// Input works with no setup: if the Input properties are left empty, the truck builds the
// same bindings as the web demo at runtime (WASD / arrows, Space handbrake, C look back,
// H horn, Backspace reset; RT/LT, left stick, A, Y, B, View on a gamepad). To use your own
// Input Action assets instead, assign all of them in the Blueprint.
#pragma once

#include "CoreMinimal.h"
#include "MoonshineVehicleBase.h"
#include "MoonshineVehicle.generated.h"

class UCameraComponent;
class USpringArmComponent;
class UInputAction;
class UInputMappingContext;
class USoundBase;
struct FInputActionValue;

UCLASS()
class MOONSHINERUN_API AMoonshineVehicle : public AMoonshineVehicleBase
{
	GENERATED_BODY()

public:
	AMoonshineVehicle();

	virtual void Tick(float DeltaSeconds) override;

	// True while hauling shine. Set by the delivery manager.
	UPROPERTY(BlueprintReadWrite, Category = "Smuggling")
	bool bCarryingCargo = false;

	// Unlocked by the Jockey in the story: hauling under 30 mph, patrols see a
	// thoroughbred on its way to the races, not a bootlegger.
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Smuggling")
	bool bDisguiseUnlocked = false;

protected:
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
	virtual void PawnClientRestart() override;

	// Chase camera that trails the rig (mirrors the web demo's chase cam).
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Camera")
	TObjectPtr<USpringArmComponent> SpringArm;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Camera")
	TObjectPtr<UCameraComponent> ChaseCamera;

	UPROPERTY(EditAnywhere, Category = "Input")
	TObjectPtr<UInputMappingContext> DrivingContext;

	UPROPERTY(EditAnywhere, Category = "Input")
	TObjectPtr<UInputAction> ThrottleAction;

	UPROPERTY(EditAnywhere, Category = "Input")
	TObjectPtr<UInputAction> BrakeAction;

	UPROPERTY(EditAnywhere, Category = "Input")
	TObjectPtr<UInputAction> SteerAction;

	UPROPERTY(EditAnywhere, Category = "Input")
	TObjectPtr<UInputAction> HandbrakeAction;

	UPROPERTY(EditAnywhere, Category = "Input")
	TObjectPtr<UInputAction> LookBackAction;

	UPROPERTY(EditAnywhere, Category = "Input")
	TObjectPtr<UInputAction> HornAction;

	UPROPERTY(EditAnywhere, Category = "Input")
	TObjectPtr<UInputAction> ResetAction;

	UPROPERTY(EditAnywhere, Category = "Audio")
	TObjectPtr<USoundBase> HornSound;

private:
	// Builds default actions and key mappings when none were assigned in the Blueprint.
	void CreateDefaultInput();

	void OnThrottle(const FInputActionValue& Value);
	void OnBrake(const FInputActionValue& Value);
	void OnSteer(const FInputActionValue& Value);
	void OnHandbrake(const FInputActionValue& Value);
	void OnLookBack(const FInputActionValue& Value);
	void OnHorn();
	void OnReset();

	float ThrottleInput = 0.f;
	float BrakeInput = 0.f;
	float SteerInput = 0.f;
	bool bHandbrakeHeld = false;
};
