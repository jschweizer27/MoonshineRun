// BTService_ShinePursuit.h: Dev Guide Phase 3. Put this on the root of a pursuer's
// Behavior Tree. Several times a second it updates the cop's perception (line of sight,
// patrol suspicion, give-up timer) and writes TargetActor, CanSeeTarget,
// LastKnownLocation, Mode and DriveGoal to the blackboard.
#pragma once

#include "CoreMinimal.h"
#include "BehaviorTree/BTService.h"
#include "BTService_ShinePursuit.generated.h"

UCLASS(meta = (DisplayName = "Shine Pursuit"))
class MOONSHINERUN_API UBTService_ShinePursuit : public UBTService
{
	GENERATED_BODY()

public:
	UBTService_ShinePursuit();

protected:
	virtual void TickNode(UBehaviorTreeComponent& OwnerComp, uint8* NodeMemory, float DeltaSeconds) override;
};
