/*
 *  Power BI Visual CLI
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */
"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionId = powerbi.visuals.ISelectionId;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;

import { createTooltipServiceWrapper, ITooltipServiceWrapper, TooltipEventArgs } from "powerbi-visuals-utils-tooltiputils";

import { VisualFormattingSettingsModel } from "./settings";
import { max, scaleBand, scaleLinear, select, selectAll } from "d3";

interface IDatapoint {
  country: string;
  value: number;
  selectionId: ISelectionId;
}

export class Visual implements IVisual {
  private target: HTMLElement;
  private formattingSettings: VisualFormattingSettingsModel;
  private formattingSettingsService: FormattingSettingsService;
  public visualSVG: any;
  private selectionManager: ISelectionManager;
  private tooltipServiceWrapper: ITooltipServiceWrapper;
  public host: IVisualHost;

  constructor(options: VisualConstructorOptions) {
    // console.log("Visual constructor", options);
    this.formattingSettingsService = new FormattingSettingsService();
    this.host = options.host;
    this.selectionManager = this.host.createSelectionManager();
    this.tooltipServiceWrapper = createTooltipServiceWrapper(this.host.tooltipService, options.element);
    this.target = options.element;
    this.visualSVG = select(this.target).append("svg").classed("visualSVG", true);
  }

  public update(options: VisualUpdateOptions) {
    this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, options.dataViews);

    this.visualSVG.selectAll("*").remove();

    const visualWidth = options.viewport.width;
    const visualHeight = options.viewport.height;

    const categories = options.dataViews[0].categorical.categories;
    const countries = categories[0].values as string[];
    const revenue: number[] = options.dataViews[0].categorical.values[0].values as number[];

    const maxRevenue = max(revenue);

    const xScale = scaleBand().domain(countries).range([0, visualWidth]).padding(0.2);
    const yScale = scaleLinear().domain([0, maxRevenue]).range([0, visualHeight]);
    const barWidth = xScale.bandwidth();

    countries.forEach((country, categoryIndex) => {
      const revenueValue = revenue[categoryIndex];
      const x = xScale(country);
      const height = yScale(revenueValue);

      const categorySelectionId = this.host.createSelectionIdBuilder().withCategory(categories[0], categoryIndex).createSelectionId();
      const datapoint: IDatapoint = {
        value: revenueValue,
        country: country,
        selectionId: categorySelectionId,
      };

      this.visualSVG
        .append("rect")
        .classed("bar", true)
        .data([datapoint])
        .attr("width", barWidth)
        .attr("height", height)
        .attr("fill", "red")
        .attr("stroke", "black")
        .attr("x", x)
        .attr("y", visualHeight - height)
        .style("display", this.formattingSettings.barChartCard.showBars.value ? "block" : "none")
        .on("click", (d: IDatapoint) => {
          this.selectionManager.select(d.selectionId).then((ids: ISelectionId[]) => {
            this.syncSelectionState(selectAll(".bar"), ids);
          });
        });
    });

    this.tooltipServiceWrapper.addTooltip(
      selectAll(".bar"),
      (tooltipEvent: TooltipEventArgs<number>) => this.getTooltipData(tooltipEvent),
      (tooltipEvent: any) => tooltipEvent.selectionId
    );

    this.handleContextMenu();
    // console.log("Visual update", options);
  }

  private handleContextMenu() {
    selectAll(".bar").on("contextmenu", (event: PointerEvent, dataPoint: any) => {
      const mouseEvent: MouseEvent = <MouseEvent>event;
      this.selectionManager.showContextMenu(dataPoint ? dataPoint.selectionId : {}, {
        x: mouseEvent.clientX,
        y: mouseEvent.clientY,
      });
      mouseEvent.preventDefault();
    });
  }

  private getTooltipData(data: any): VisualTooltipDataItem[] {
    let tooltipDataArray: VisualTooltipDataItem[] = [];

    tooltipDataArray.push({
      header: data.country,
      displayName: "Revenue",
      value: `${data.value}`,
    });

    return tooltipDataArray;
  }

  private syncSelectionState(barSelection, selectionIds: ISelectionId[]) {
    if (!barSelection || !selectionIds) {
      return;
    }

    if (selectionIds.length === 0) {
      selectAll(".bar").style("opacity", 1);
      return;
    }

    barSelection.each((datapoint: IDatapoint, i, e) => {
      const selectionId = datapoint.selectionId;
      const isSelected = selectionIds.some((currentSelectionId) => {
        return currentSelectionId.includes(selectionId);
      });
      const opacity = isSelected ? 1 : 0.5;
      const currentBar = select(e[i]);
      currentBar.style("opacity", opacity);
    });
  }

  /**
   * Returns properties pane formatting model content hierarchies, properties and latest formatting values, Then populate properties pane.
   * This method is called once every time we open properties pane or when the user edit any format property.
   */
  public getFormattingModel(): powerbi.visuals.FormattingModel {
    return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
  }
}
