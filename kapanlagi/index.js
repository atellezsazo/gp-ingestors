'use strict';

const libingester = require('libingester');
const xml2js = require('xml2js');
const mustache = require('mustache');
const request = require('request');
const rp = require('request-promise');
const rss2json = require('rss-to-json');
const template = require('./template');
const url = require('url');

const base_uri = "https://www.kapanlagi.com/";
const rss_uri = "https://www.kapanlagi.com/feed/";

//Remove elements (body)
const remove_elements = [
    'iframe',
    'noscript',
    'script',
    '.box-share-img-detail',
    '.video-wrapper',
];

//clean attr (tag)
const remove_attr = [
    'class',
    'height',
    'id',
    'sizes',
    'src',
    'srcset',
    'style',
    'width',
];

//embed content
const video_iframes = [
    'youtube',
    'a.kapanlagi',
];

function ingest_article(hatch, uri) {

    return libingester.util.fetch_html(uri).then(($profile) => {
        const asset = new libingester.NewsArticle();
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);
        //Set title section
        const title = $profile('meta[property="og:title"]').attr('content');
        asset.set_title(title);
        asset.set_canonical_uri(uri);
        const title_new = $profile(".newsdetail-right-new h1").first().text();


        // Pull out the updated date
        const info_date = $profile('.newsdetail-schedule-new .value-title').attr('title');
        let modified_date = new Date(Date.parse(info_date));
        if (modified_date)
            modified_date = new Date();

        asset.set_last_modified_date(modified_date);
        const category = $profile('.newsdetail-categorylink').first().text();
        const keywords = $profile('meta[name="keywords"]').attr('content');

        asset.set_section(category + "," + keywords);
        const by_line = $profile('.vcard').children();

        let pages = [];
        const ingest_body = ($profile, finish_process) => {
            // Pull out the main image
            let main_img = $profile('.entertainment-newsdetail-headlineimg img, .pg-img-warper img').first();
            const main_image = libingester.util.download_img(main_img, base_uri);
            main_image.set_title(main_image.title);
            const image_credit = $profile('.entertainment-newsdetail-headlineimg .copyright, .pg-img-warper span');
            hatch.save_asset(main_image);

            const subtitle = $profile("h2.entertainment-newsdetail-title-new").first().text();
            let post_body = $profile('.entertainment-detail-news');

            //Download images 
            post_body.find("img").map(function() {
                if (this.attribs.src) {
                    const image = libingester.util.download_img(this, base_uri);
                    hatch.save_asset(image);
                    this.attribs["data-libingester-asset-id"] = image.asset_id;
                    for (const attr of remove_attr) {
                        delete this.attribs[attr];
                    }
                }
            });

            // download videos
            const videos = post_body.find("iframe").map(function() {
                const iframe_src = this.attribs.src;
                for (const video_iframe of video_iframes) {
                    if (iframe_src.includes(video_iframe)) {
                        const video_url = this.attribs.src;
                        const full_uri = url.format(video_url, { search: false })
                        const video_asset = new libingester.VideoAsset();
                        video_asset.set_canonical_uri(full_uri);
                        video_asset.set_last_modified_date(modified_date);
                        video_asset.set_title(title);
                        video_asset.set_download_uri(full_uri);
                        hatch.save_asset(video_asset);
                    }
                }
            });

            //remove elements (body)
            for (const remove_element of remove_elements) {
                post_body.find(remove_element).remove();
            }

            //clean elements
            post_body.find("a, div, h1, h2, h3, h4, h5, h6, span").map(function() {
                if (this.attribs.style) {
                    delete this.attribs.style;
                }
            });

            pages.push({
                subtitle: subtitle,
                img: main_image,
                img_credit: image_credit,
                body: post_body.html(),
            });

            const next = $profile('.link-pagging-warper a').attr('href');
            const last_pagination = $profile('ul.pg-pagging li:last-child a').first();

            if (next && last_pagination.length != 0) {
                console.log(next);
                libingester.util.fetch_html(url.resolve(base_uri, next)).then(($next_profile) => {
                    ingest_body($next_profile, finish_process);
                });
            } else {
                finish_process();
            }

        };

        const promise = new Promise((resolve, reject) => {
            ingest_body($profile, function() {
                const content = mustache.render(template.structure_template, {
                    title: title_new,
                    pages: pages,
                });

                // save document
                asset.set_document(content);
                hatch.save_asset(asset);
                resolve();
            });
        });

        return Promise.all([promise]);
    });
}

function main() {
    const hatch = new libingester.Hatch();

    ingest_article(hatch, "https://www.kapanlagi.com/showbiz/selebriti/weekly-hot-dari-lupain-mantan-hingga-lagu-sindir-ayu-ting-ting-820217.html").then(() => {
        console.log("fin");
        return hatch.finish();
    });

    /*
    rp({ uri: rss_uri, gzip: true, }).then((res) => {
        var parser = new xml2js.Parser({ trim: false, normalize: true, mergeAttrs: true });
        parser.parseString(res, function(err, result) {
            const rss = rss2json.parser(result);
            let posts_url = [];
            rss.items.map((datum) => {
                if (!datum.link.includes("musik.kapanlagi.com")) { //disard musik subdomain
                    posts_url.push(datum.link);
                }
            });
            Promise.all(posts_url.map((url) => ingest_article(hatch, url))).then(() => {
                return hatch.finish();
            });
        });
    }); */
}

main();