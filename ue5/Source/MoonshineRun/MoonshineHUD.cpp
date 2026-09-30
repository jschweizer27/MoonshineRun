#include "MoonshineHUD.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"
#include "MoonshineDeliveryManager.h"
#include "MoonshineMarker.h"
#include "MoonshineVehicle.h"

namespace
{
	const FLinearColor Gold(1.f, 0.78f, 0.35f);
	const FLinearColor Amber(1.f, 0.6f, 0.15f);
	const FLinearColor Red(0.95f, 0.2f, 0.15f);
	const FLinearColor Blue(0.3f, 0.6f, 1.f);
	const FLinearColor Dim(0.f, 0.f, 0.f, 0.55f);
}

void AMoonshineHUD::ShowMessage(const FString& Text, const FLinearColor& Color, float Seconds)
{
	Message = Text;
	MessageColor = Color;
	MessageUntil = GetWorld()->GetTimeSeconds() + Seconds;
}

void AMoonshineHUD::HandleDelivered(int32 Pay)
{
	ShowMessage(FString::Printf(TEXT("DELIVERED  +$%d"), Pay), Gold);
}

void AMoonshineHUD::HandleBusted(int32 Fine)
{
	ShowMessage(FString::Printf(TEXT("BUSTED!  Cargo seized, fined $%d"), Fine), Red, 4.f);
}

void AMoonshineHUD::HandleWantedChanged(int32 NewLevel)
{
	if (NewLevel > ShownTier)
	{
		ShowMessage(NewLevel == 1 ? TEXT("THE LAW IS ONTO YOU") : TEXT("MORE HEAT!"), Red);
	}
	else if (NewLevel < ShownTier)
	{
		ShowMessage(NewLevel == 0 ? TEXT("YOU LOST THEM") : TEXT("LOSING THEM..."), Blue);
	}
	ShownTier = NewLevel;
}

void AMoonshineHUD::DrawBar(float X, float Y, float Width, float Height, float Fill, const FLinearColor& Color)
{
	DrawRect(Dim, X, Y, Width, Height);
	DrawRect(Color, X, Y, Width * FMath::Clamp(Fill, 0.f, 1.f), Height);
}

void AMoonshineHUD::DrawHUD()
{
	Super::DrawHUD();
	if (!Canvas)
	{
		return;
	}
	if (!Manager.IsValid())
	{
		Manager = AMoonshineDeliveryManager::Find(this);
		if (!Manager.IsValid())
		{
			return;
		}
		Manager->OnDelivered.AddDynamic(this, &AMoonshineHUD::HandleDelivered);
		Manager->OnBusted.AddDynamic(this, &AMoonshineHUD::HandleBusted);
		Manager->OnWantedChanged.AddDynamic(this, &AMoonshineHUD::HandleWantedChanged);
	}
	const AMoonshineDeliveryManager* M = Manager.Get();
	const float S = Canvas->ClipY / 1080.f;   // scale everything with the screen height
	const float W = Canvas->ClipX;
	UFont* Big = GEngine->GetLargeFont();
	UFont* Small = GEngine->GetMediumFont();

	// Cash, top right.
	DrawText(FString::Printf(TEXT("$%d"), M->Cash), Gold, W - 300.f * S, 30.f * S, Big, 2.2f * S);

	// Wanted stars and the meter under them.
	const int32 Tier = M->GetTier();
	for (int32 i = 0; i < ShineTuning::MaxTier; ++i)
	{
		DrawRect(i < Tier ? Red : Dim, W - 300.f * S + i * 46.f * S, 95.f * S, 36.f * S, 36.f * S);
	}
	FString MeterLabel;
	float Meter = 0.f;
	FLinearColor MeterColor = Amber;
	if (Tier == 0 && M->bCarrying)
	{
		MeterLabel = TEXT("SUSPICION");
		Meter = M->Suspicion;
	}
	else if (Tier > 0 && M->bSeen && M->bCarrying && Tier < ShineTuning::MaxTier)
	{
		MeterLabel = TEXT("HEAT RISING");
		Meter = M->Heat - Tier;
		MeterColor = Red;
	}
	else if (Tier > 0)
	{
		MeterLabel = M->bSeen ? TEXT("SEEN") : TEXT("LOSING THEM...");
		Meter = M->Evade;
		MeterColor = Blue;
	}
	if (!MeterLabel.IsEmpty())
	{
		DrawBar(W - 300.f * S, 145.f * S, 270.f * S, 12.f * S, Meter, MeterColor);
		DrawText(MeterLabel, MeterColor, W - 300.f * S, 162.f * S, Small, 1.2f * S);
	}

	// Bust bar, centre: fills while you're pinned.
	if (M->BustMeter > 0.f)
	{
		DrawText(TEXT("PINNED - GET MOVING!"), Red, W * 0.5f - 150.f * S, Canvas->ClipY * 0.72f, Small, 1.5f * S);
		DrawBar(W * 0.5f - 200.f * S, Canvas->ClipY * 0.72f + 40.f * S, 400.f * S, 16.f * S, M->BustMeter, Red);
	}

	// Objective and distance, top left.
	const APawn* Player = GetOwningPawn();
	FString Objective = M->GetObjectiveText().ToString();
	if (const AMoonshineMarker* Target = M->GetObjective(); Target && Player && Target->IsShown())
	{
		const float Meters = FVector::Dist2D(Player->GetActorLocation(), Target->GetActorLocation()) / 100.f;
		Objective += FString::Printf(TEXT("   %d m"), FMath::RoundToInt(Meters));
	}
	DrawText(Objective, FLinearColor::White, 40.f * S, 30.f * S, Big, 1.3f * S);
	if (M->bCarrying)
	{
		DrawText(FString::Printf(TEXT("Hauling shine, worth $%d"), M->CurrentPay), Amber, 40.f * S, 80.f * S, Small, 1.2f * S);
	}

	// Speed, bottom right.
	if (const AMoonshineVehicle* Truck = Cast<AMoonshineVehicle>(Player))
	{
		DrawText(FString::Printf(TEXT("%d mph"), FMath::RoundToInt(Truck->GetSpeedMph())), FLinearColor::White,
			W - 220.f * S, Canvas->ClipY - 90.f * S, Big, 1.6f * S);
	}

	// Pop-up message, centre.
	if (GetWorld()->GetTimeSeconds() < MessageUntil)
	{
		float TextW = 0.f, TextH = 0.f;
		GetTextSize(Message, TextW, TextH, Big, 2.f * S);
		DrawText(Message, MessageColor, (W - TextW) * 0.5f, Canvas->ClipY * 0.3f, Big, 2.f * S);
	}
}
