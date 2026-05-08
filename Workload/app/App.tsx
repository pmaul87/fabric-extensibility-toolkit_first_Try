import React from "react";
import { Route, Router, Switch } from "react-router-dom";
import { History } from "history";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { HelloWorldItemEditor} from "./items/HelloWorldItem";
import { InsightWorkbenchItemEditor } from "./items/InsightWorkbenchItem";
import { LineageExtractorItemEditor } from "./items/LineageExtractorItem";
import { LineageViewerItemEditor } from "./items/LineageViewerItem";
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
            {/* Routings for the Hello World Item Editor */}
            <Route path="/HelloWorldItem-editor/:itemObjectId">
                <HelloWorldItemEditor
                    workloadClient={workloadClient} data-testid="HelloWorldItem-editor" />
            </Route>

            {/* Routings for the Insight Workbench Item Editor */}
            <Route path="/InsightWorkbenchItem-editor/:itemObjectId">
                <InsightWorkbenchItemEditor
                    workloadClient={workloadClient} data-testid="InsightWorkbenchItem-editor" />
            </Route>

            {/* Routings for the LineageExtractor Item Editor */}
            <Route path="/LineageExtractorItem-editor/:itemObjectId">
                <LineageExtractorItemEditor
                    workloadClient={workloadClient} data-testid="LineageExtractorItem-editor" />
            </Route>

            {/* Routings for the LineageViewer Item Editor */}
            <Route path="/LineageViewerItem-editor/:itemObjectId">
                <LineageViewerItemEditor
                    workloadClient={workloadClient} data-testid="LineageViewerItem-editor" />
            </Route>

            {/* Conditionally loaded playground routes (only in development) */}
            <ConditionalPlaygroundRoutes workloadClient={workloadClient} />
        </Switch>
    </Router>;
}