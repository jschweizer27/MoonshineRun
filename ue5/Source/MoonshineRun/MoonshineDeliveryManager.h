// MoonshineDeliveryManager.h: Dev Guide Phases 4 and 5. The bootlegger loop, the money and
// the heat, mirroring the web demo's src/mission.js and src/main.js:
//   - Drive into the STILL ring to load up; deliver to the DROP across town to get paid.
//     Pay = jugs x price x (1 + distance / 900 m).
//   - While hauling, informants build suspicion; at 100% you get your first star. A patrol
//     that spots a suspicious truck also gives you a star.
//   - Staying in a pursuer's sight while loaded builds heat toward 3 stars. Staying out of
//     every pursuer's sight fills the evade meter (5 / 7 / 9 s per star) and sheds a star.
//   - Stars set how many pursuers chase you; 2+ stars put roadblocks ahead; 3 stars makes
//     pursuers faster.
//   - Busted when a pursuer pins you (within 7.5 m while you're under ~9 mph) for 2 s: you
//     lose the cargo, pay a fine (10% of your cash, at least $100) and continue from the
//     hideout.
//   - Roll slowly into the HIDEOUT, empty and unseen, to lie low and clear the heat.
//
// Needs no setup to run: the game mode spawns one if the level has none. It uses actors
// tagged "Still", "Drop" and "Hideout" when you place some (Actor > Tags), and random
// points on the navmesh when you don't.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ShineTuning.h"
#include "ShineTypes.h"
#include "MoonshineDeliveryManager.generated.h"

class AMoonshineMarker;
class AMoonshineVehicle;
class AProhibitionCop;
class AProhibitionCopController;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnShineCashChanged, int32, NewTotal);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnShineWantedChanged, int32, NewLevel);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnShinePickedUp, int32, Pay);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnShineDelivered, int32, Pay);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnShineBusted, int32, Fine);

// What the pursuers saw this frame (summed over every cop).
struct FShinePoliceReport
{
	bool bSeen = false;
	bool bSpotted = false;
	float NearestChaser = TNumericLimits<float>::Max();
};

UCLASS()
class MOONSHINERUN_API AMoonshineDeliveryManager : public AActor
{
	GENERATED_BODY()

public:
	AMoonshineDeliveryManager();

	// The manager in this world, if any.
	static AMoonshineDeliveryManager* Find(const UObject* WorldContext);

	// ---- Places (leave empty to use tagged actors, then random navmesh points) ----

	UPROPERTY(EditAnywhere, Category = "Smuggling|Places")
	TArray<TObjectPtr<AActor>> StillSpots;

	UPROPERTY(EditAnywhere, Category = "Smuggling|Places")
	TArray<TObjectPtr<AActor>> DropSpots;

	// Where you continue after a bust and lie low. Defaults to where the truck started.
	UPROPERTY(EditAnywhere, Category = "Smuggling|Places")
	TObjectPtr<AActor> Hideout;

	UPROPERTY(EditAnywhere, Category = "Smuggling")
	TSubclassOf<AMoonshineMarker> MarkerClass;

	UPROPERTY(EditAnywhere, Category = "Smuggling")
	float MarkerRadius = ShineTuning::MarkerRadius;

	UPROPERTY(EditAnywhere, Category = "Smuggling")
	float MinPickupDistance = ShineTuning::MinPickupDistance;

	UPROPERTY(EditAnywhere, Category = "Smuggling")
	float MinDropDistance = ShineTuning::MinDropDistance;

	// The load Otto takes at each still (the web demo's "Standard run").
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Smuggling")
	FShineOrder Order;

	// ---- Police ----

	// Blueprint children of ProhibitionCop with a mesh. With none set, nobody chases you.
	UPROPERTY(EditAnywhere, Category = "Police")
	TSubclassOf<AProhibitionCop> FedClass;

	UPROPERTY(EditAnywhere, Category = "Police")
	TSubclassOf<AProhibitionCop> ZealotClass;

	// Optional: parked sedans and sawhorses placed across the road ahead at 2+ stars.
	UPROPERTY(EditAnywhere, Category = "Police")
	TSubclassOf<AActor> RoadblockClass;

	UPROPERTY(EditAnywhere, Category = "Police")
	int32 PatrolCount = ShineTuning::PatrolCount;

	UPROPERTY(EditAnywhere, Category = "Police")
	float SpawnMin = ShineTuning::SpawnMin;

	UPROPERTY(EditAnywhere, Category = "Police")
	float SpawnMax = ShineTuning::SpawnMax;

	UPROPERTY(EditAnywhere, Category = "Police")
	float DespawnDistance = ShineTuning::DespawnDistance;

	UPROPERTY(EditAnywhere, Category = "Police")
	float PinRadius = ShineTuning::PinRadius;

	UPROPERTY(EditAnywhere, Category = "Police")
	float PinSpeed = ShineTuning::PinSpeed;

	UPROPERTY(EditAnywhere, Category = "Police")
	float BustTime = ShineTuning::BustTime;

	UPROPERTY(EditAnywhere, Category = "Police")
	float BustRecover = ShineTuning::BustRecover;

	// ---- Heat ----

	UPROPERTY(EditAnywhere, Category = "Heat")
	float TipOffRate = ShineTuning::TipOffRate;

	UPROPERTY(EditAnywhere, Category = "Heat")
	float BuildRateSeen = ShineTuning::BuildRateSeen;

	// Seconds out of every pursuer's sight to shed a star, indexed by star level (0..3).
	UPROPERTY(EditAnywhere, Category = "Heat")
	TArray<float> EvadeSeconds;

	UPROPERTY(EditAnywhere, Category = "Heat")
	float DisguiseSpeed = ShineTuning::DisguiseSpeed;

	UPROPERTY(EditAnywhere, Category = "Heat")
	float DisguiseSuspicion = ShineTuning::DisguiseSuspicion;

	// Set from a trigger volume (e.g. the county after the sheriff's bribe): nobody sees you.
	UPROPERTY(BlueprintReadWrite, Category = "Heat")
	bool bInSafeZone = false;

	// ---- Live state, for the HUD and Blueprints ----

	UPROPERTY(BlueprintReadOnly, Category = "State")
	int32 Cash = 0;

	UPROPERTY(BlueprintReadOnly, Category = "State")
	int32 RunsCompleted = 0;

	// Money earned since the last bust.
	UPROPERTY(BlueprintReadOnly, Category = "State")
	int32 Streak = 0;

	UPROPERTY(BlueprintReadOnly, Category = "State")
	bool bCarrying = false;

	// Pay for the load aboard.
	UPROPERTY(BlueprintReadOnly, Category = "State")
	int32 CurrentPay = 0;

	// 0..3; whole stars plus progress toward the next.
	UPROPERTY(BlueprintReadOnly, Category = "State")
	float Heat = 0.f;

	// 0..1 toward the first star while hauling.
	UPROPERTY(BlueprintReadOnly, Category = "State")
	float Suspicion = 0.f;

	// 0..1 toward shedding a star.
	UPROPERTY(BlueprintReadOnly, Category = "State")
	float Evade = 0.f;

	// 0..1; busted at 1.
	UPROPERTY(BlueprintReadOnly, Category = "State")
	float BustMeter = 0.f;

	// A pursuer can see you right now.
	UPROPERTY(BlueprintReadOnly, Category = "State")
	bool bSeen = false;

	UFUNCTION(BlueprintPure, Category = "Heat")
	int32 GetTier() const;

	UFUNCTION(BlueprintPure, Category = "Heat")
	FShineHeatContext GetHeatContext() const;

	// The marker to drive to next.
	UFUNCTION(BlueprintPure, Category = "Smuggling")
	AMoonshineMarker* GetObjective() const;

	UFUNCTION(BlueprintPure, Category = "Smuggling")
	FText GetObjectiveText() const;

	UFUNCTION(BlueprintCallable, Category = "Heat")
	void ClearHeat();

	UFUNCTION(BlueprintCallable, Category = "Heat")
	void Bust();

	UPROPERTY(BlueprintAssignable) FOnShineCashChanged OnCashChanged;
	UPROPERTY(BlueprintAssignable) FOnShineWantedChanged OnWantedChanged;
	UPROPERTY(BlueprintAssignable) FOnShinePickedUp OnPickedUp;
	UPROPERTY(BlueprintAssignable) FOnShineDelivered OnDelivered;
	UPROPERTY(BlueprintAssignable) FOnShineBusted OnBusted;

protected:
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

private:
	AMoonshineVehicle* GetTruck() const;
	void StartRun(AMoonshineVehicle* Truck);
	void UpdateLoop(AMoonshineVehicle* Truck);
	FShinePoliceReport UpdatePolice(const FVector& PlayerLocation);
	void UpdateHeat(float DeltaSeconds, const FShinePoliceReport& Police);
	void UpdateBust(float DeltaSeconds, const FShinePoliceReport& Police, const AMoonshineVehicle* Truck);
	void SetPursuers(int32 Count, const FVector& PlayerLocation);
	void MaintainPatrols(float DeltaSeconds, const FVector& PlayerLocation);
	void UpdateRoadblocks(float DeltaSeconds, const AMoonshineVehicle* Truck);

	void PlacePickup(const FVector& AwayFrom);
	void PlaceDrop(const FVector& From);
	bool PickSpot(const TArray<TObjectPtr<AActor>>& Spots, const FVector& AwayFrom, float MinDistance, FVector& Out) const;
	bool RandomGroundPoint(const FVector& Around, float MinDistance, float MaxDistance, FVector& Out) const;
	bool ProjectToGround(FVector& InOut) const;
	bool CanPlayerSee(const FVector& Location) const;
	void CollectTagged(FName Tag, TArray<TObjectPtr<AActor>>& Out) const;
	AProhibitionCop* SpawnCop(EPursuerKind Kind, float MinDistance, float MaxDistance, const FVector& PlayerLocation);
	AProhibitionCopController* GetBrain(const AProhibitionCop* Cop) const;
	float EvadeTimeFor(int32 Tier) const;

	UPROPERTY() TObjectPtr<AMoonshineMarker> PickupMarker;
	UPROPERTY() TObjectPtr<AMoonshineMarker> DropMarker;
	UPROPERTY() TObjectPtr<AMoonshineMarker> HideoutMarker;
	UPROPERTY() TArray<TObjectPtr<AProhibitionCop>> Cops;
	UPROPERTY() TArray<TObjectPtr<AActor>> Roadblocks;

	bool bStarted = false;
	bool bContact = false;
	bool bWarnedNoCops = false;
	int32 PrevTier = 0;
	int32 CopsSpawned = 0;
	float PatrolTimer = 0.f;
	float RoadblockTimer = 0.f;
	FTransform HomeTransform;
	FVector StillLocation = FVector::ZeroVector;
};
