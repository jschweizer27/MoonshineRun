// MoonshineWheels.h: Chaos wheel settings shared by every vehicle. Front wheels steer;
// rear wheels drive and lock with the handbrake (so the truck can slide, as in the web demo).
// Set WheelRadius / WheelWidth in a Blueprint child to match your mesh.
#pragma once

#include "CoreMinimal.h"
#include "ChaosVehicleWheel.h"
#include "MoonshineWheels.generated.h"

UCLASS()
class MOONSHINERUN_API UMoonshineWheelFront : public UChaosVehicleWheel
{
	GENERATED_BODY()

public:
	UMoonshineWheelFront();
};

UCLASS()
class MOONSHINERUN_API UMoonshineWheelRear : public UChaosVehicleWheel
{
	GENERATED_BODY()

public:
	UMoonshineWheelRear();
};
