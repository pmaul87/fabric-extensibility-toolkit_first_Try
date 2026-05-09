import React from "react";
import { Route, Router, Switch } from "react-router-dom";
import { History } from "history";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
// Removed: import { LineageViewerItemEditor } from "./items/LineageViewerItem";
import { RequirementBoardItemEditor } from "./items/RequirementBoardItem";
import { LineageWorkbenchItemEditor } from "./items/LineageWorkbenchItem";
import { ConditionalPlaygroundRoutes } from "./playground/ConditionalPlaygroundRoutes";

/*
    Add your Item Editor in the Route section of the App function below
*/

interface AppProps {
    history: History;
    workloadClient: WorkloadClientAPI;
}

export interface PageProps {
    workloadClient: WorkloadClientAPI;
    history?: History
}

export interface ContextProps {
    itemObjectId?: string;
    workspaceObjectId?: string
    source?: string;
}

export interface SharedState {
    message: string;
}

export function App({ history, workloadClient }: AppProps) {
    return <Router history={history}>
        <Switch>
            {/* Routings for the LineageViewer Item Editor */}
            {/* Removed: Standalone LineageViewerItemEditor route */}

            {/* Routings for the RequirementBoard Item Editor */}
            <Route path="/RequirementBoardItem-editor/:itemObjectId">
                <RequirementBoardItemEditor
                    workloadClient={workloadClient} data-testid="RequirementBoardItem-editor" />
            </Route>

            {/* Routings for the LineageWorkbench Item Editor */}
            <Route path="/LineageWorkbenchItem-editor/:itemObjectId">
                <LineageWorkbenchItemEditor
                    workloadClient={workloadClient} data-testid="LineageWorkbenchItem-editor" />
            </Route>

            {/* Conditionally loaded playground routes (only in development) */}
            <ConditionalPlaygroundRoutes workloadClient={workloadClient} />
        </Switch>
    </Router>;
}