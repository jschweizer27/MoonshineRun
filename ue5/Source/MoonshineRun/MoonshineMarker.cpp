#include "MoonshineMarker.h"
#include "Camera/PlayerCameraManager.h"
#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/TextRenderComponent.h"
#include "Engine/StaticMesh.h"
#include "Kismet/GameplayStatics.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	constexpr float GlowIntensity = 8000.f;
}

AMoonshineMarker::AMoonshineMarker()
{
	PrimaryActorTick.bCanEverTick = true;
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));

	// A tall thin column (the engine cylinder is 100 cm wide and 100 cm tall).
	Beam = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Beam"));
	Beam->SetupAttachment(RootComponent);
	Beam->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Beam->SetCastShadow(false);
	Beam->SetRelativeScale3D(FVector(0.6f, 0.6f, 40.f));
	Beam->SetRelativeLocation(FVector(0.f, 0.f, 2000.f));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cylinder(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	if (Cylinder.Succeeded())
	{
		Beam->SetStaticMesh(Cylinder.Object);
	}

	Glow = CreateDefaultSubobject<UPointLightComponent>(TEXT("Glow"));
	Glow->SetupAttachment(RootComponent);
	Glow->SetRelativeLocation(FVector(0.f, 0.f, 300.f));
	Glow->SetIntensity(GlowIntensity);
	Glow->SetAttenuationRadius(2500.f);
	Glow->SetCastShadows(false);

	Label = CreateDefaultSubobject<UTextRenderComponent>(TEXT("Label"));
	Label->SetupAttachment(RootComponent);
	Label->SetRelativeLocation(FVector(0.f, 0.f, 700.f));
	Label->SetHorizontalAlignment(EHTA_Center);
	Label->SetWorldSize(250.f);
}

void AMoonshineMarker::SetKind(EShineMarkerKind NewKind)
{
	Kind = NewKind;
	FLinearColor Color;
	FText Text;
	switch (Kind)
	{
	case EShineMarkerKind::Drop:
		Color = FLinearColor(0.25f, 0.55f, 1.f);
		Text = NSLOCTEXT("Shine", "Drop", "DROP");
		break;
	case EShineMarkerKind::Hideout:
		Color = FLinearColor(0.35f, 0.9f, 0.45f);
		Text = NSLOCTEXT("Shine", "Hideout", "HIDEOUT");
		break;
	default:
		Color = FLinearColor(1.f, 0.62f, 0.15f);
		Text = NSLOCTEXT("Shine", "Still", "STILL");
		break;
	}
	Glow->SetLightColor(Color);
	Label->SetText(Text);
	Label->SetTextRenderColor(Color.ToFColor(true));
	if (UMaterialInstanceDynamic* Material = Beam->CreateAndSetMaterialInstanceDynamic(0))
	{
		Material->SetVectorParameterValue(TEXT("Color"), Color);
	}
	OnKindChanged(Kind);
}

void AMoonshineMarker::SetShown(bool bShown)
{
	SetActorHiddenInGame(!bShown);
}

void AMoonshineMarker::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (IsHidden())
	{
		return;
	}
	// Pulse, and turn the label to face the camera.
	const float Time = GetWorld()->GetTimeSeconds();
	Glow->SetIntensity(GlowIntensity * (0.8f + 0.2f * FMath::Sin(Time * 3.f)));
	if (const APlayerCameraManager* Camera = UGameplayStatics::GetPlayerCameraManager(this, 0))
	{
		const FVector ToCamera = Camera->GetCameraLocation() - Label->GetComponentLocation();
		Label->SetWorldRotation(FRotator(0.f, ToCamera.Rotation().Yaw, 0.f));
	}
}
