// 16 型人格报告展示（结果页与成果页共用），移植自 components/ReportMbti.vue
Component({
  properties: {
    report: { type: Object, value: null, observer: 'onReport' }
  },

  data: {
    careersLabel: '',
    compatibleLabel: ''
  },

  methods: {
    onReport(r) {
      if (!r) return
      this.setData({
        careersLabel: (r.careers || []).join(' · '),
        compatibleLabel: (r.compatible || []).join(' · ')
      })
    }
  }
})
