// BTTask_ShineDriveTo.h: Dev Guide Phase 3. Drive a pursuer car to a blackboard Vector or
// Actor (vehicles can't use the stock Move To, which walks characters). Re-reads the key
// every frame, so it follows a moving target.
#pragma once

#include "CoreMinimal.h"
#include "BehaviorTree/Tasks/BTTask_BlackboardBase.h"
#include "BTTask_ShineDriveTo.generated.h"

UCLASS(meta = (DisplayName = "Shine Drive To"))
class MOONSHINERUN_API UBTTask_ShineDriveTo : public UBTTask_BlackboardBase
{
	GENERATED_BODY()

public:
	UBTTask_ShineDriveTo();

	// Succeed once this close to the goal (cm).
	UPROPERTY(EditAnywhere, Category = "Driving")
	float AcceptanceRadius = 1400.f;

	// Multiplies the speed the cop's current mode wants (patrol 40%, chase 100%, ...).
	UPROPERTY(EditAnywhere, Category = "Driving")
	float SpeedScale = 1.f;

	// Never finish: keep following the key (use for DriveGoal, which the Shine Pursuit
	// service keeps up to date).
	UPROPERTY(EditAnywhere, Category = "Driving")
	bool bFollowContinuously = false;

protected:
	virtual EBTNodeResult::Type ExecuteTask(UBehaviorTreeComponent& OwnerComp, uint8* NodeMemory) override;
	virtual void TickTask(UBehaviorTreeComponent& OwnerComp, uint8* NodeMemory, float DeltaSeconds) override;
	virtual EBTNodeResult::Type AbortTask(UBehaviorTreeComponent& OwnerComp, uint8* NodeMemory) override;

private:
	bool ReadGoal(const UBehaviorTreeComponent& OwnerComp, FVector& OutGoal) const;
};
