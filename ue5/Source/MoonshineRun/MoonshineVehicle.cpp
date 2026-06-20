// MoonshineVehicle.cpp — Dev Guide Phase 1
// SKELETON: not compiled here. Fill in mesh/wheel setup in your UE5 project.
#include "MoonshineVehicle.h"
#include "ChaosWheeledVehicleMovementComponent.h"
#include "Camera/CameraComponent.h"
#include "GameFramework/SpringArmComponent.h"

AMoonshineVehicle::AMoonshineVehicle()
{
	PrimaryActorTick.bCanEverTick = true;

	SpringArm = CreateDefaultSubobject<USpringArmComponent>(TEXT("SpringArm"));
	SpringArm->SetupAttachment(GetMesh());
	SpringArm->TargetArmLength = 650.f;
	SpringArm->SocketOffset = FVector(0.f, 0.f, 250.f);
	SpringArm->bEnableCameraLag = true;
	SpringArm->CameraLagSpeed = 6.f;

	ChaseCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("ChaseCamera"));
	ChaseCamera->SetupAttachment(SpringArm);

	// TODO: assign skeletal mesh, configure 4 wheels + engine/transmission on the
	// UChaosWheeledVehicleMovementComponent (see Dev Guide Phase 1).
}

void AMoonshineVehicle::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);
	// TODO: bind Enhanced Input actions to Throttle/Brake/Steer.
}

void AMoonshineVehicle::Throttle(float Value)
{
	if (UChaosWheeledVehicleMovementComponent* Move =
		Cast<UChaosWheeledVehicleMovementComponent>(GetVehicleMovementComponent()))
	{
		Move->SetThrottleInput(Value);
	}
}

void AMoonshineVehicle::Brake(float Value)
{
	if (UChaosWheeledVehicleMovementComponent* Move =
		Cast<UChaosWheeledVehicleMovementComponent>(GetVehicleMovementComponent()))
	{
		Move->SetBrakeInput(Value);
	}
}

void AMoonshineVehicle::Steer(float Value)
{
	if (UChaosWheeledVehicleMovementComponent* Move =
		Cast<UChaosWheeledVehicleMovementComponent>(GetVehicleMovementComponent()))
	{
		Move->SetSteeringInput(Value);
	}
}
