# Workflow Access Control Guide

This document explains how data visibility and permissions work in the workflow system.

---

## Quick Reference: What Participants Can See

```mermaid
flowchart TB
    subgraph VISIBLE["ALWAYS VISIBLE to all participants"]
        stages["Stage Names & Order"]
        progress["Workflow Progress<br/>(which stage is active)"]
        instance_status["Instance Status<br/>(active, completed, etc.)"]
    end

    subgraph PROTECTED["PROTECTED by role settings"]
        connections["Action Buttons<br/>(connection.allowed_roles)"]
        tools["Forms & Edit Tools<br/>(tool.allowed_roles)"]
        field_data["Collected Data<br/>(stage.visible_to_roles)"]
    end

    participant["Participant"] --> VISIBLE
    participant -.->|"only if role<br/>is authorized"| PROTECTED
```

---

## For Business Users: Understanding Data Exposure

### What Your Participants Will Always See

| Information | Visibility | Example |
|-------------|------------|---------|
| Stage names | All participants | "Submit", "Review", "Approved" |
| Number of stages | All participants | "Stage 2 of 4" |
| Current stage | All participants | "Currently at: Review" |
| Instance status | All participants | "Active", "Completed" |

### What You Control With Roles

```mermaid
flowchart LR
    subgraph workflow["Your Workflow"]
        s1["Stage 1<br/>Submit"]
        s2["Stage 2<br/>Internal Review"]
        s3["Stage 3<br/>Resolution"]
    end

    subgraph controls["You Control"]
        c1["Who sees the<br/>SUBMIT button?"]
        c2["Who sees data<br/>from Stage 1?"]
        c3["Who sees data<br/>from Stage 2?"]
    end

    s1 -.-> c1
    s1 -.-> c2
    s2 -.-> c3
```

### Role Configuration Cheat Sheet

| Setting | Empty = | Specific Roles = |
|---------|---------|------------------|
| `stage.visible_to_roles` | All roles see data from this stage | Only listed roles see data |
| `connection.allowed_roles` | All roles see this action button | Only listed roles see button |
| `tool.allowed_roles` | All roles see this form/tool | Only listed roles see it |
| `workflow.entry_allowed_roles` | Anyone can create new instances | Only listed roles can create |

### Example: Insurance Claim Workflow

```mermaid
flowchart TB
    subgraph workflow["Insurance Claim Workflow"]
        direction TB
        submit["Stage 1: Submit Claim<br/>visible_to_roles: [Reporter, Manager]"]
        review["Stage 2: Internal Review<br/>visible_to_roles: [Adjuster]"]
        approve["Stage 3: Approval<br/>visible_to_roles: [Manager]"]
        resolve["Stage 4: Resolution<br/>visible_to_roles: [Reporter, Manager]"]

        submit -->|"allowed_roles:<br/>[Adjuster]"| review
        review -->|"allowed_roles:<br/>[Manager]"| approve
        approve -->|"allowed_roles:<br/>[Manager]"| resolve
    end

    subgraph reporter["Reporter Sees"]
        r1["Stage names: ALL"]
        r2["Progress: 'Stage 2 of 4'"]
        r3["Data from Stage 1"]
        r4["Data from Stage 4"]
        r5["NO action buttons"]
        r6["NO Stage 2/3 data"]
    end

    subgraph adjuster["Adjuster Sees"]
        a1["Stage names: ALL"]
        a2["Progress: 'Stage 2 of 4'"]
        a3["Data from Stage 2"]
        a4["Button: Submit Review"]
        a5["NO Stage 1/3/4 data"]
    end
```

### Data Exposure Summary

```mermaid
pie showData
    title "What a Reporter Can Access"
    "Visible (stages, progress)" : 30
    "Their own stage data" : 20
    "Protected (internal data)" : 50
```

**Key Principle:** Participants see workflow STRUCTURE (stages, progress) but NOT implementation DETAILS (internal forms, data from protected stages).

---

## For Developers: Technical Implementation

### Architecture Overview

```mermaid
flowchart TB
    subgraph layer1["Layer 1: Project Membership"]
        check1["participant.project_id = resource.project_id"]
    end

    subgraph layer2["Layer 2: Structure Transparency"]
        stages_t["workflow_stages: OPEN"]
        instances_t["workflow_instances: OPEN"]
    end

    subgraph layer3["Layer 3: Role-Based Protection"]
        connections_p["workflow_connections<br/>allowed_roles"]
        tools_p["tools_forms / tools_edit<br/>tool.allowed_roles"]
        fields_p["workflow_instance_field_values<br/>stage.visible_to_roles"]
        usage_p["workflow_instance_tool_usage<br/>current_stage.visible_to_roles"]
    end

    subgraph layer4["Layer 4: Action Permissions"]
        create["CREATE instance<br/>workflow.entry_allowed_roles"]
        transition["TRIGGER transition<br/>connection.allowed_roles"]
        update["UPDATE instance<br/>current_stage.visible_to_roles"]
    end

    layer1 --> layer2
    layer2 --> layer3
    layer3 --> layer4
```

### PocketBase Rule Patterns

```mermaid
flowchart LR
    subgraph helpers["Helper Functions"]
        h1["participantInProject(path)<br/>@request.auth.collectionName = 'participants'<br/>&& path = @request.auth.project_id"]
        h2["roleCheck(field)<br/>field:length = 0<br/>|| @request.auth.role_id.id ?= field.id"]
    end
```

### Collection Access Rules

```mermaid
erDiagram
    workflow_stages {
        string listRule "OPEN - all project participants"
        string viewRule "OPEN - all project participants"
    }

    workflow_connections {
        string listRule "roleCheck(allowed_roles)"
        string viewRule "roleCheck(allowed_roles)"
    }

    workflow_instances {
        string listRule "OPEN - all project participants"
        string viewRule "OPEN - all project participants"
        string createRule "roleCheck(workflow.entry_allowed_roles)"
        string updateRule "roleCheck(current_stage.visible_to_roles)"
    }

    tools_forms {
        string listRule "stage: roleCheck(allowed_roles)"
        string listRule2 "connection: roleCheck(connection.allowed_roles)"
    }

    workflow_instance_field_values {
        string listRule "roleCheck(stage_id.visible_to_roles)"
        string createRule "roleCheck(current_stage.visible_to_roles)"
        string updateRule "roleCheck(stage_id.visible_to_roles)"
    }
```

### Data Flow: What Gets Filtered

```mermaid
sequenceDiagram
    participant P as Participant
    participant PB as PocketBase
    participant DB as Database

    P->>PB: GET /workflow_stages
    PB->>DB: Query with project filter
    DB-->>PB: All stages
    PB-->>P: All stages (TRANSPARENT)

    P->>PB: GET /workflow_connections
    PB->>DB: Query with project + role filter
    DB-->>PB: All connections
    PB->>PB: Filter by allowed_roles
    PB-->>P: Only authorized connections

    P->>PB: GET /workflow_instance_field_values
    PB->>DB: Query with project + role filter
    DB-->>PB: All field values
    PB->>PB: Filter by stage.visible_to_roles
    PB-->>P: Only authorized field values
```

### Empty Array Convention

```mermaid
flowchart LR
    subgraph empty["allowed_roles = []"]
        e1["Means: ALL roles allowed"]
        e2["No filtering applied"]
    end

    subgraph specific["allowed_roles = [RoleA, RoleB]"]
        s1["Means: Only RoleA and RoleB"]
        s2["Others filtered out"]
    end
```

### Rule Implementation Reference

| Collection | LIST/VIEW Rule |
|------------|----------------|
| `workflow_stages` | `owner OR participantInProject` |
| `workflow_connections` | `owner OR (participantInProject AND roleCheck(allowed_roles))` |
| `workflow_instances` | `owner OR participantInProject` |
| `tools_forms` | `owner OR (participantInProject AND (connection: roleCheck(connection.allowed_roles) OR stage: roleCheck(allowed_roles)))` |
| `tools_form_fields` | Inherits from parent form |
| `tools_edit` | `owner OR (participantInProject AND (connection: roleCheck(connection.allowed_roles) OR stage: roleCheck(allowed_roles)))` |
| `workflow_instance_field_values` | LIST/VIEW: `roleCheck(stage_id.visible_to_roles)`; CREATE: `roleCheck(current_stage.visible_to_roles)` |
| `workflow_instance_tool_usage` | `owner OR (participantInProject AND roleCheck(instance.current_stage.visible_to_roles))` |

### Important: CREATE vs READ for Field Values

```mermaid
flowchart LR
    subgraph create["CREATE Field Value"]
        c1["Check: instance.current_stage.visible_to_roles"]
        c2["Purpose: Allow transition form submission"]
    end

    subgraph read["READ Field Value"]
        r1["Check: stage_id.visible_to_roles"]
        r2["Purpose: Protect data from unauthorized roles"]
    end

    create --> example["Reporter fills form at Stage 1<br/>Data tagged for Stage 2<br/>Reporter CAN create<br/>Reporter CANNOT read later"]
```

### Important: No Creator Bypass

```mermaid
flowchart TB
    subgraph old["OLD Behavior (Removed)"]
        direction LR
        creator1["Instance Creator"] -->|"could see"| all1["ALL field values"]
    end

    subgraph new["CURRENT Behavior"]
        direction LR
        creator2["Instance Creator"] -->|"same rules as"| others["Other Participants"]
        others -->|"filtered by"| roles["stage.visible_to_roles"]
    end

    old -.->|"REMOVED"| new
```

**Why:** The creator of an instance should not automatically see sensitive data from internal processing stages. All participants are treated equally based on their role.

---

## Migration Files

| File | Purpose |
|------|---------|
| `1768800000_add_workflow_entry_roles.js` | Adds `entry_allowed_roles` field to workflows |
| `1768800001_workflow_access_rules.js` | Implements the 4-layer access control model |

---

## Testing Access Control

### As Admin (Project Owner)
- Should see ALL data in all collections
- Full CRUD on everything

### As Participant
Test with different roles:

```bash
# Get participant token
curl -X POST "$PB_URL/api/collections/participants/auth-with-password" \
  -d '{"identity":"test@example.com","password":"test123"}'

# Test connections (should only see allowed ones)
curl -H "Authorization: Bearer $TOKEN" \
  "$PB_URL/api/collections/workflow_connections/records"

# Test field values (should only see authorized stages)
curl -H "Authorization: Bearer $TOKEN" \
  "$PB_URL/api/collections/workflow_instance_field_values/records"
```

---

## Quick Decision Guide

```mermaid
flowchart TB
    q1{"Should ALL participants<br/>see this?"}
    q1 -->|Yes| transparent["Leave role arrays EMPTY"]
    q1 -->|No| q2{"Who should see it?"}
    q2 --> specific["Add specific roles to<br/>allowed_roles or visible_to_roles"]

    subgraph examples["Examples"]
        ex1["Entry form for everyone:<br/>entry_allowed_roles = []"]
        ex2["Manager-only approval:<br/>connection.allowed_roles = [Manager]"]
        ex3["Internal review data:<br/>stage.visible_to_roles = [Reviewer, Manager]"]
    end
```
