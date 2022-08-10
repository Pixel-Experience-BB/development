/*
 * Copyright (C) 2022 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {Timestamp, TimestampType} from "common/trace/timestamp";
import {TraceType} from "common/trace/trace_type";
import {Parser} from "parsers/parser";
import {ParserFactory} from "parsers/parser_factory";
import { setTraces } from "trace_collection/set_traces";
import { proxyClient } from "trace_collection/proxy_client";
import {Viewer} from "viewers/viewer";
import {ViewerFactory} from "viewers/viewer_factory";

class Core {
  private parsers: Parser[];
  private viewers: Viewer[];

  constructor() {
    this.parsers = [];
    this.viewers = [];
  }

  async bootstrap(traces: Blob[]) {
    this.clearData();
    this.parsers = await new ParserFactory().createParsers(traces);
    console.log("created parsers: ", this.parsers);

    const activeTraceTypes = this.parsers.map(parser => parser.getTraceType());
    console.log("active trace types: ", activeTraceTypes);

    this.viewers = new ViewerFactory().createViewers(new Set<TraceType>(activeTraceTypes));
    console.log("created viewers: ", this.viewers);
  }

  getViews(): HTMLElement[] {
    return this.viewers.map(viewer => viewer.getView());
  }

  getTimestamps(): Timestamp[] {
    for (const type of [TimestampType.REAL, TimestampType.ELAPSED]) {
      const mergedTimestamps: Timestamp[] = [];

      let isTypeProvidedByAllParsers = true;

      for(const timestamps of this.parsers.map(parser => parser.getTimestamps(type))) {
        if (timestamps === undefined) {
          isTypeProvidedByAllParsers = false;
          break;
        }
        mergedTimestamps.push(...timestamps!);
      }

      if (isTypeProvidedByAllParsers) {
        const uniqueTimestamps = [... new Set<Timestamp>(mergedTimestamps)];
        uniqueTimestamps.sort();
        return uniqueTimestamps;
      }
    }

    throw new Error("Failed to create aggregated timestamps (any type)");
  }

  notifyCurrentTimestamp(timestamp: Timestamp) {
    const traceEntries: Map<TraceType, any> = new Map<TraceType, any>();

    this.parsers.forEach(parser => {
      const entry = parser.getTraceEntry(timestamp);
      if (entry != undefined) {
        traceEntries.set(parser.getTraceType(), entry);
      }
    });

    this.viewers.forEach(viewer => {
      viewer.notifyCurrentTraceEntries(traceEntries);
    });
  }

  clearData() {
    this.parsers = [];
    this.viewers = [];
    setTraces.dataReady = false;
    proxyClient.adbData = [];
  }
}

export { Core };