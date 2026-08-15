// Body type selector component (styled as tree category)
import m from "mithril";
import { state } from "../../state/state.ts";
import { BODY_TYPES } from "../../state/constants.ts";

const BODY_TYPE_LABELS: Record<string, string> = {
  male: "男性",
  female: "女性",
  teen: "青少年",
  child: "小孩",
  muscular: "肌肉型",
  pregnant: "孕妇",
};

type State = { isExpanded: boolean };

export const BodyTypeSelector: m.Component<Record<string, never>, State> = {
  oninit(vnode) {
    vnode.state.isExpanded = true; // Start expanded by default
  },
  view(vnode) {
    return m("div.mb-3", [
      m(
        "div.tree-label",
        {
          onclick: () => {
            vnode.state.isExpanded = !vnode.state.isExpanded;
          },
        },
        [
          m("span.tree-arrow", {
            class: vnode.state.isExpanded ? "expanded" : "collapsed",
          }),
          m("span.has-text-weight-semibold", "体型"),
        ],
      ),
      vnode.state.isExpanded
        ? m("div.ml-4.mt-2", [
            m(
              "div.buttons.ml-4",
              BODY_TYPES.map((type) =>
                m(
                  "button.button.is-small",
                  {
                    class: state.bodyType === type ? "is-primary" : "",
                    onclick: () => {
                      state.bodyType = type;
                    },
                  },
                  BODY_TYPE_LABELS[type] ?? type,
                ),
              ),
            ),
          ])
        : null,
    ]);
  },
};
