#include "MoonshineVehicle.h"
#include "Camera/CameraComponent.h"
#include "Engine/LocalPlayer.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "InputAction.h"
#include "InputMappingContext.h"
#include "InputModifiers.h"
#include "Kismet/GameplayStatics.h"

AMoonshineVehicle::AMoonshineVehicle()
{
	// Far enough back and high enough to see over the horse trailer.
	SpringArm = CreateDefaultSubobject<USpringArmComponent>(TEXT("SpringArm"));
	SpringArm->SetupAttachment(GetMesh());
	SpringArm->TargetArmLength = 1500.f;
	SpringArm->SocketOffset = FVector(0.f, 0.f, 400.f);
	SpringArm->SetRelativeRotation(FRotator(-10.f, 0.f, 0.f));
	SpringArm->bInheritPitch = false;
	SpringArm->bInheritRoll = false;
	SpringArm->bEnableCameraLag = true;
	SpringArm->CameraLagSpeed = 6.f;
	SpringArm->bEnableCameraRotationLag = true;
	SpringArm->CameraRotationLagSpeed = 4.f;

	ChaseCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("ChaseCamera"));
	ChaseCamera->SetupAttachment(SpringArm);
	ChaseCamera->FieldOfView = 62.f;
}

void AMoonshineVehicle::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (IsLocallyControlled())
	{
		SetDriveInput(ThrottleInput, BrakeInput, SteerInput, bHandbrakeHeld);
	}
}

void AMoonshineVehicle::CreateDefaultInput()
{
	if (DrivingContext)
	{
		return;   // assets assigned in the Blueprint win
	}

	auto MakeAction = [this](const TCHAR* Name, EInputActionValueType Type)
	{
		UInputAction* Action = NewObject<UInputAction>(this, Name);
		Action->ValueType = Type;
		return Action;
	};
	ThrottleAction = MakeAction(TEXT("IA_Throttle"), EInputActionValueType::Axis1D);
	BrakeAction = MakeAction(TEXT("IA_Brake"), EInputActionValueType::Axis1D);
	SteerAction = MakeAction(TEXT("IA_Steer"), EInputActionValueType::Axis1D);
	HandbrakeAction = MakeAction(TEXT("IA_Handbrake"), EInputActionValueType::Boolean);
	LookBackAction = MakeAction(TEXT("IA_LookBack"), EInputActionValueType::Boolean);
	HornAction = MakeAction(TEXT("IA_Horn"), EInputActionValueType::Boolean);
	ResetAction = MakeAction(TEXT("IA_Reset"), EInputActionValueType::Boolean);

	UInputMappingContext* Context = NewObject<UInputMappingContext>(this, TEXT("IMC_Driving"));
	auto Map = [Context](UInputAction* Action, const FKey& Key, bool bNegate = false)
	{
		FEnhancedActionKeyMapping& Mapping = Context->MapKey(Action, Key);
		if (bNegate)
		{
			Mapping.Modifiers.Add(NewObject<UInputModifierNegate>(Context));
		}
	};
	Map(ThrottleAction, EKeys::W);
	Map(ThrottleAction, EKeys::Up);
	Map(ThrottleAction, EKeys::Gamepad_RightTriggerAxis);
	Map(BrakeAction, EKeys::S);
	Map(BrakeAction, EKeys::Down);
	Map(BrakeAction, EKeys::Gamepad_LeftTriggerAxis);
	Map(SteerAction, EKeys::D);
	Map(SteerAction, EKeys::Right);
	Map(SteerAction, EKeys::A, true);
	Map(SteerAction, EKeys::Left, true);
	FEnhancedActionKeyMapping& Stick = Context->MapKey(SteerAction, EKeys::Gamepad_LeftX);
	Stick.Modifiers.Add(NewObject<UInputModifierDeadZone>(Context));
	Map(HandbrakeAction, EKeys::SpaceBar);
	Map(HandbrakeAction, EKeys::Gamepad_FaceButton_Bottom);
	Map(LookBackAction, EKeys::C);
	Map(LookBackAction, EKeys::Gamepad_FaceButton_Top);
	Map(HornAction, EKeys::H);
	Map(HornAction, EKeys::Gamepad_FaceButton_Right);
	Map(ResetAction, EKeys::BackSpace);
	Map(ResetAction, EKeys::Gamepad_Special_Left);
	DrivingContext = Context;
}

void AMoonshineVehicle::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);
	CreateDefaultInput();

	UEnhancedInputComponent* Input = Cast<UEnhancedInputComponent>(PlayerInputComponent);
	if (!Input)
	{
		return;   // Config/DefaultInput.ini makes Enhanced Input the default
	}
	// Axes report on Triggered while held and once more on Completed (value 0) on release.
	for (const ETriggerEvent Event : { ETriggerEvent::Triggered, ETriggerEvent::Completed })
	{
		Input->BindAction(ThrottleAction, Event, this, &AMoonshineVehicle::OnThrottle);
		Input->BindAction(BrakeAction, Event, this, &AMoonshineVehicle::OnBrake);
		Input->BindAction(SteerAction, Event, this, &AMoonshineVehicle::OnSteer);
		Input->BindAction(HandbrakeAction, Event, this, &AMoonshineVehicle::OnHandbrake);
		Input->BindAction(LookBackAction, Event, this, &AMoonshineVehicle::OnLookBack);
	}
	Input->BindAction(HornAction, ETriggerEvent::Started, this, &AMoonshineVehicle::OnHorn);
	Input->BindAction(ResetAction, ETriggerEvent::Started, this, &AMoonshineVehicle::OnReset);
}

void AMoonshineVehicle::PawnClientRestart()
{
	CreateDefaultInput();
	Super::PawnClientRestart();   // creates the input component and calls SetupPlayerInputComponent

	if (const APlayerController* PC = Cast<APlayerController>(GetController()))
	{
		if (UEnhancedInputLocalPlayerSubsystem* Subsystem = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer()))
		{
			Subsystem->ClearAllMappings();
			Subsystem->AddMappingContext(DrivingContext, 0);
		}
	}
}

void AMoonshineVehicle::OnThrottle(const FInputActionValue& Value) { ThrottleInput = Value.Get<float>(); }
void AMoonshineVehicle::OnBrake(const FInputActionValue& Value) { BrakeInput = Value.Get<float>(); }
void AMoonshineVehicle::OnSteer(const FInputActionValue& Value) { SteerInput = Value.Get<float>(); }
void AMoonshineVehicle::OnHandbrake(const FInputActionValue& Value) { bHandbrakeHeld = Value.Get<bool>(); }

void AMoonshineVehicle::OnLookBack(const FInputActionValue& Value)
{
	const bool bBack = Value.Get<bool>();
	SpringArm->SetRelativeRotation(FRotator(-10.f, bBack ? 180.f : 0.f, 0.f));
	SpringArm->bEnableCameraRotationLag = !bBack;   // snap round, no swing
}

void AMoonshineVehicle::OnHorn()
{
	if (HornSound)
	{
		UGameplayStatics::PlaySoundAtLocation(this, HornSound, GetActorLocation());
	}
}

void AMoonshineVehicle::OnReset()
{
	ResetTo(GetActorTransform());
}
