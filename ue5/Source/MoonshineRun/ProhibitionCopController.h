// ProhibitionCopController.h: Dev Guide Phase 3. The brain of one pursuer, mirroring the
// web demo's src/police.js:
//   Patrol: cruise near Otto; react only to a truck that looks wrong (hauling and speeding,
//           or close enough to see the jugs), or to anyone once he's wanted.
//   Chase:  pursue while in sight. Feds lead the target, zealots ram. Out of sight, drive
//           to the last sighting.
//   Search: comb the streets around the last sighting.
//   Leave:  the heat dropped; drive away and despawn out of view.
// Every cop keeps its own timers. The old scaffold shared one `static` timer between all
// of them, so one cop losing sight reset every other cop's search.
//
// With a Behavior Tree on the cop, the BT drives this controller: the "Shine Pursuit"
// service calls UpdatePursuit() and fills the blackboard, and the "Shine Drive To" task
// calls DriveToward(). Without one, Tick() runs the same two steps itself.
#pragma once

#include "CoreMinimal.h"
#include "AIController.h"
#include "ShineTypes.h"
#include "ProhibitionCopController.generated.h"

class AProhibitionCop;
class AMoonshineDeliveryManager;

UCLASS()
class MOONSHINERUN_API AProhibitionCopController : public AAIController
{
	GENERATED_BODY()

public:
	AProhibitionCopController();

	// Blackboard keys written by the Shine Pursuit service (create them in your Blackboard).
	static const FName TargetKey;        // Object (Actor): Otto's truck
	static const FName CanSeeKey;        // Bool
	static const FName LastKnownKey;     // Vector
	static const FName ModeKey;          // Enum (EPursuerMode)
	static const FName DriveGoalKey;     // Vector: where the built-in logic would drive now

	UPROPERTY(BlueprintReadOnly, Category = "AI")
	EPursuerMode Mode = EPursuerMode::Patrol;

	UPROPERTY(BlueprintReadOnly, Category = "AI")
	bool bSeesPlayer = false;

	UPROPERTY(BlueprintReadOnly, Category = "AI")
	FVector LastKnownLocation = FVector::ZeroVector;

	// Seconds since this cop last saw Otto.
	UPROPERTY(BlueprintReadOnly, Category = "AI")
	float TimeOutOfSight = 0.f;

	// Seconds in the current mode.
	UPROPERTY(BlueprintReadOnly, Category = "AI")
	float ModeTime = 0.f;

	// Perception and mode changes. Call once per update.
	void UpdatePursuit(float DeltaSeconds);

	// Where the built-in logic wants to drive right now, and how fast (cm/s).
	FVector GetDriveGoal();
	float GetDesiredSpeed() const;

	// Steer toward a point, following the navmesh around buildings when there is one.
	void DriveToward(const FVector& Goal, float Speed, float DeltaSeconds);
	void StopDriving();

	void StartChase(const FVector& PlayerLocation);
	void StartLeaving(const FVector& PlayerLocation);
	void SetMode(EPursuerMode NewMode);
	bool IsChasing() const { return Mode == EPursuerMode::Chase || Mode == EPursuerMode::Search; }

	// True once, the frame a patrol first spots a suspicious truck.
	bool ConsumeSpotted();

	// A random drivable point near Around (on the navmesh if there is one).
	FVector PickRoadPoint(const FVector& Around, float Radius) const;

	void WriteBlackboard();
	AProhibitionCop* GetCop() const;

protected:
	virtual void OnPossess(APawn* InPawn) override;
	virtual void Tick(float DeltaSeconds) override;

private:
	FShineHeatContext GetHeatContext();
	bool HasLineOfSight(const AActor* Target) const;
	void Unstick(float& Throttle, float& Brake, float& Steer, float DeltaSeconds);

	TWeakObjectPtr<AMoonshineDeliveryManager> Manager;
	bool bUsingBehaviorTree = false;
	bool bSpotted = false;

	FVector WanderGoal = FVector::ZeroVector;
	bool bHasWanderGoal = false;
	FVector LeaveGoal = FVector::ZeroVector;

	TArray<FVector> Path;
	int32 PathIndex = 0;
	FVector PathGoal = FVector::ZeroVector;
	float RepathTimer = 0.f;

	float StuckTime = 0.f;
	float ReverseTime = 0.f;
};
