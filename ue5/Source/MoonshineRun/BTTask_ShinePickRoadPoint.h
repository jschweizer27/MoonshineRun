// BTTask_ShinePickRoadPoint.h: Dev Guide Phase 3. Writes a random drivable point (on the
// navmesh when there is one) into a blackboard Vector: patrol routes around Otto, or a
// search pattern around where he was last seen.
#pragma once

#include "CoreMinimal.h"
#include "BehaviorTree/Tasks/BTTask_BlackboardBase.h"
#include "ShineTypes.h"
#include "BTTask_ShinePickRoadPoint.generated.h"

UCLASS(meta = (DisplayName = "Shine Pick Road Point"))
class MOONSHINERUN_API UBTTask_ShinePickRoadPoint : public UBTTask_BlackboardBase
{
	GENERATED_BODY()

public:
	UBTTask_ShinePickRoadPoint();

	UPROPERTY(EditAnywhere, Category = "Road Point")
	EShinePointOrigin Around = EShinePointOrigin::Player;

	UPROPERTY(EditAnywhere, Category = "Road Point")
	float Radius = 30000.f;

protected:
	virtual EBTNodeResult::Type ExecuteTask(UBehaviorTreeComponent& OwnerComp, uint8* NodeMemory) override;
};
