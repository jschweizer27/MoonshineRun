// MoonshineDeliveryManager.h — Dev Guide Phases 4 & 5
// The bootlegger loop + economy + wanted tiers. Place pickup/drop markers, pay
// out on delivery, and escalate heat. Mirrors src/mission.js in the web demo.
// SKELETON: not compiled here.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "MoonshineDeliveryManager.generated.h"

class AMoonshineVehicle;
class AProhibitionCop;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnCashChanged, int32, NewTotal);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnWantedChanged, int32, NewLevel);

UCLASS()
class MOONSHINERUN_API AMoonshineDeliveryManager : public AActor
{
	GENERATED_BODY()

public:
	AMoonshineDeliveryManager();

	UPROPERTY(EditAnywhere, Category = "Smuggling")
	float PickupRadius = 700.f;

	UPROPERTY(EditAnywhere, Category = "Smuggling")
	float DeliverRadius = 700.f;

	UPROPERTY(EditAnywhere, Category = "Economy")
	int32 Reward = 850;

	UPROPERTY(BlueprintReadOnly, Category = "Economy")
	int32 Cash = 0;

	UPROPERTY(BlueprintReadOnly, Category = "Economy")
	int32 RunsCompleted = 0;

	// 0..3 — drives how many AProhibitionCop pawns are active (Phase 5).
	UPROPERTY(BlueprintReadOnly, Category = "Heat")
	int32 WantedLevel = 0;

	UPROPERTY(BlueprintAssignable) FOnCashChanged OnCashChanged;
	UPROPERTY(BlueprintAssignable) FOnWantedChanged OnWantedChanged;

protected:
	virtual void Tick(float DeltaSeconds) override;

	UPROPERTY() AActor* PickupMarker = nullptr;
	UPROPERTY() AActor* DropMarker = nullptr;

	bool bCarrying = false;
	float Heat = 0.f;             // continuous; rounded to WantedLevel

	void PlacePickup();
	void PlaceDrop(const FVector& AwayFrom);
	void UpdateHeat(float DeltaSeconds);
};
